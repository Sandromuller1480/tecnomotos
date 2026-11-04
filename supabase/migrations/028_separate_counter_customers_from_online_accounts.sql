BEGIN;

-- A commercial customer is no longer required to be an Auth user.
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
    ALTER COLUMN email DROP NOT NULL;

-- Roles belong to authenticated accounts, not to commercial profiles.
ALTER TABLE public.user_roles
    DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

ALTER TABLE public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS registration_source TEXT NOT NULL DEFAULT 'COUNTER',
    ADD COLUMN IF NOT EXISTS online_enabled_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'customers_registration_source_check'
          AND conrelid = 'public.customers'::regclass
    ) THEN
        ALTER TABLE public.customers
            ADD CONSTRAINT customers_registration_source_check
            CHECK (registration_source IN ('COUNTER', 'ONLINE'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS customers_auth_user_id_key
    ON public.customers(auth_user_id)
    WHERE auth_user_id IS NOT NULL;

-- Existing self-registered customers did not receive role=CUSTOMER in user metadata.
-- Administrative counter registrations did; they remain commercial records only.
UPDATE public.customers AS c
SET auth_user_id = c.id,
    registration_source = 'ONLINE',
    online_enabled_at = COALESCE(c.online_enabled_at, now())
FROM auth.users AS u
WHERE u.id = c.id
  AND COALESCE(u.raw_user_meta_data->>'role', '') <> 'CUSTOMER';

UPDATE public.customers AS c
SET auth_user_id = NULL,
    registration_source = 'COUNTER',
    online_enabled_at = NULL
FROM auth.users AS u
WHERE u.id = c.id
  AND (
      u.raw_user_meta_data->>'role' = 'CUSTOMER'
      OR COALESCE((u.raw_user_meta_data->>'email_is_internal')::boolean, false)
  );

-- Remove login accounts that were provisioned by the old counter workflow.
-- The profile, customer, addresses, vehicles and history remain intact.
DELETE FROM auth.users AS u
USING public.customers AS c
WHERE c.id = u.id
  AND c.registration_source = 'COUNTER'
  AND c.auth_user_id IS NULL
  AND (
      u.raw_user_meta_data->>'role' = 'CUSTOMER'
      OR COALESCE((u.raw_user_meta_data->>'email_is_internal')::boolean, false)
  );

-- Resolve the commercial customer owned by an authenticated online account.
CREATE OR REPLACE FUNCTION public.current_customer_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT c.id
    FROM public.customers AS c
    WHERE c.auth_user_id = auth.uid()
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_customer_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_customer_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_customer_id() TO service_role;

-- Atomic creation used by the physical-store counter. It never creates Auth users.
CREATE OR REPLACE FUNCTION public.create_counter_customer(
    p_full_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_document TEXT DEFAULT NULL,
    p_birth_date DATE DEFAULT NULL,
    p_street TEXT DEFAULT NULL,
    p_number TEXT DEFAULT NULL,
    p_complement TEXT DEFAULT NULL,
    p_neighborhood TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_state TEXT DEFAULT NULL,
    p_postal_code TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_customer_id UUID := gen_random_uuid();
    v_email TEXT := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
    v_document TEXT := NULLIF(regexp_replace(COALESCE(p_document, ''), '\D', '', 'g'), '');
BEGIN
    IF auth.uid() IS NULL OR NOT (
        public.is_owner(auth.uid()) OR
        public.has_permission(auth.uid(), 'customers.create')
    ) THEN
        RAISE EXCEPTION 'Sem permissão para cadastrar clientes.' USING ERRCODE = '42501';
    END IF;

    IF char_length(btrim(COALESCE(p_full_name, ''))) < 3 THEN
        RAISE EXCEPTION 'Informe o nome completo do cliente.';
    END IF;

    IF char_length(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g')) < 8 THEN
        RAISE EXCEPTION 'Informe um telefone válido.';
    END IF;

    INSERT INTO public.profiles (id, full_name, email, phone, avatar_url, status)
    VALUES (v_customer_id, btrim(p_full_name), v_email, btrim(p_phone), '', 'ACTIVE');

    INSERT INTO public.customers (
        id, document, birth_date, auth_user_id, registration_source, online_enabled_at
    ) VALUES (
        v_customer_id, v_document, p_birth_date, NULL, 'COUNTER', NULL
    );

    IF NULLIF(btrim(COALESCE(p_street, '')), '') IS NOT NULL
       AND NULLIF(btrim(COALESCE(p_number, '')), '') IS NOT NULL
       AND NULLIF(btrim(COALESCE(p_neighborhood, '')), '') IS NOT NULL
       AND NULLIF(btrim(COALESCE(p_city, '')), '') IS NOT NULL
       AND NULLIF(btrim(COALESCE(p_state, '')), '') IS NOT NULL
       AND NULLIF(regexp_replace(COALESCE(p_postal_code, ''), '\D', '', 'g'), '') IS NOT NULL THEN
        INSERT INTO public.customer_addresses (
            customer_id, street, number, complement, neighborhood,
            city, state, postal_code, is_default
        ) VALUES (
            v_customer_id, btrim(p_street), btrim(p_number), NULLIF(btrim(COALESCE(p_complement, '')), ''),
            btrim(p_neighborhood), btrim(p_city), upper(btrim(p_state)),
            regexp_replace(p_postal_code, '\D', '', 'g'), true
        );
    END IF;

    RETURN v_customer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_counter_customer(TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_counter_customer(TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Online sign-up: link to a counter customer when CPF/CNPJ and phone match;
-- otherwise create a new commercial customer attached to the Auth account.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_customer_role_id UUID;
    v_customer_id UUID;
    v_existing_auth_user_id UUID;
    v_existing_phone TEXT;
    v_existing_document TEXT;
    v_document TEXT := NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'document', ''), '\D', '', 'g'), '');
    v_phone_digits TEXT := regexp_replace(COALESCE(NEW.raw_user_meta_data->>'phone', ''), '\D', '', 'g');
    v_street TEXT := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'address_street', '')), '');
    v_number TEXT := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'address_number', '')), '');
    v_neighborhood TEXT := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'address_neighborhood', '')), '');
    v_city TEXT := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'address_city', '')), '');
    v_state TEXT := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'address_state', '')), '');
    v_postal_code TEXT := NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'address_postal_code', ''), '\D', '', 'g'), '');
BEGIN
    -- Administrative Auth accounts (owner/employee) are completed by their
    -- respective server actions and must not become commercial customers.
    IF v_document IS NULL THEN
        INSERT INTO public.profiles (id, full_name, email, avatar_url, phone, status)
        VALUES (
            NEW.id,
            COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1)),
            lower(NEW.email),
            COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
            NEW.raw_user_meta_data->>'phone',
            'ACTIVE'
        );
        RETURN NEW;
    END IF;

    IF char_length(v_document) NOT BETWEEN 11 AND 14 THEN
        RAISE EXCEPTION 'Informe um CPF ou CNPJ válido para criar a conta online.';
    END IF;

    SELECT c.id, c.auth_user_id, regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), c.document
      INTO v_customer_id, v_existing_auth_user_id, v_existing_phone, v_existing_document
    FROM public.customers AS c
    JOIN public.profiles AS p ON p.id = c.id
    WHERE c.document = v_document
    LIMIT 1;

    -- Legacy counter records may not have a document. In that case, an exact
    -- email + phone match is accepted and the document is completed.
    IF v_customer_id IS NULL THEN
        SELECT c.id, c.auth_user_id, regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), c.document
          INTO v_customer_id, v_existing_auth_user_id, v_existing_phone, v_existing_document
        FROM public.customers AS c
        JOIN public.profiles AS p ON p.id = c.id
        WHERE c.auth_user_id IS NULL
          AND lower(p.email) = lower(NEW.email)
          AND regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g') = v_phone_digits
        LIMIT 1;
    END IF;

    IF v_customer_id IS NOT NULL THEN
        IF v_existing_auth_user_id IS NOT NULL THEN
            RAISE EXCEPTION 'Este CPF/CNPJ já possui uma conta online.';
        END IF;

        IF v_existing_phone = '' OR v_existing_phone <> v_phone_digits THEN
            RAISE EXCEPTION 'O telefone informado não confere com o cadastro realizado na loja física.';
        END IF;

        IF v_existing_document IS NOT NULL AND v_existing_document <> v_document THEN
            RAISE EXCEPTION 'O CPF/CNPJ informado não confere com o cadastro realizado na loja física.';
        END IF;

        UPDATE public.profiles
        SET full_name = COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''), full_name),
            email = lower(NEW.email),
            phone = NEW.raw_user_meta_data->>'phone'
        WHERE id = v_customer_id;

        UPDATE public.customers
        SET auth_user_id = NEW.id,
            document = COALESCE(document, v_document),
            online_enabled_at = now()
        WHERE id = v_customer_id;
    ELSE
        v_customer_id := NEW.id;

        INSERT INTO public.profiles (id, full_name, email, avatar_url, phone, status)
        VALUES (
            v_customer_id,
            COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1)),
            lower(NEW.email),
            COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
            NEW.raw_user_meta_data->>'phone',
            'ACTIVE'
        );

        INSERT INTO public.customers (
            id, document, auth_user_id, registration_source, online_enabled_at
        ) VALUES (
            v_customer_id, v_document, NEW.id, 'ONLINE', now()
        );
    END IF;

    IF v_street IS NOT NULL AND v_number IS NOT NULL AND v_neighborhood IS NOT NULL
       AND v_city IS NOT NULL AND v_state IS NOT NULL AND v_postal_code IS NOT NULL THEN
        UPDATE public.customer_addresses
        SET is_default = false
        WHERE customer_id = v_customer_id;

        INSERT INTO public.customer_addresses (
            customer_id, street, number, complement, neighborhood,
            city, state, postal_code, is_default
        ) VALUES (
            v_customer_id, v_street, v_number,
            NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'address_complement', '')), ''),
            v_neighborhood, v_city, upper(v_state), v_postal_code, true
        );
    END IF;

    SELECT id INTO v_customer_role_id FROM public.roles WHERE name = 'CUSTOMER';
    IF v_customer_role_id IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role_id)
        VALUES (NEW.id, v_customer_role_id)
        ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS: customer ownership is now resolved through customers.auth_user_id.
DROP POLICY IF EXISTS select_profiles ON public.profiles;
CREATE POLICY select_profiles ON public.profiles FOR SELECT USING (
    id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id = profiles.id AND c.auth_user_id = auth.uid()) OR
    public.is_owner(auth.uid()) OR
    public.has_permission(auth.uid(), 'customers.view') OR
    public.has_permission(auth.uid(), 'employees.view')
);

DROP POLICY IF EXISTS update_profiles ON public.profiles;
CREATE POLICY update_profiles ON public.profiles FOR UPDATE USING (
    id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id = profiles.id AND c.auth_user_id = auth.uid()) OR
    public.is_owner(auth.uid())
) WITH CHECK (
    id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id = profiles.id AND c.auth_user_id = auth.uid()) OR
    public.is_owner(auth.uid())
);

DROP POLICY IF EXISTS select_customers ON public.customers;
CREATE POLICY select_customers ON public.customers FOR SELECT USING (
    auth_user_id = auth.uid() OR public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'customers.view')
);

DROP POLICY IF EXISTS insert_customers ON public.customers;
CREATE POLICY insert_customers ON public.customers FOR INSERT WITH CHECK (
    auth_user_id = auth.uid() OR public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'customers.create')
);

DROP POLICY IF EXISTS update_customers ON public.customers;
CREATE POLICY update_customers ON public.customers FOR UPDATE USING (
    auth_user_id = auth.uid() OR public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'customers.update')
) WITH CHECK (
    auth_user_id = auth.uid() OR public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'customers.update')
);

DROP POLICY IF EXISTS select_addresses ON public.customer_addresses;
CREATE POLICY select_addresses ON public.customer_addresses FOR SELECT USING (
    customer_id = public.current_customer_id() OR public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'customers.view')
);
DROP POLICY IF EXISTS insert_addresses ON public.customer_addresses;
CREATE POLICY insert_addresses ON public.customer_addresses FOR INSERT WITH CHECK (
    customer_id = public.current_customer_id() OR public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'customers.update')
);
DROP POLICY IF EXISTS update_addresses ON public.customer_addresses;
CREATE POLICY update_addresses ON public.customer_addresses FOR UPDATE USING (
    customer_id = public.current_customer_id() OR public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'customers.update')
);
DROP POLICY IF EXISTS delete_addresses ON public.customer_addresses;
CREATE POLICY delete_addresses ON public.customer_addresses FOR DELETE USING (
    customer_id = public.current_customer_id() OR public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'customers.update')
);

DROP POLICY IF EXISTS select_vehicles ON public.customer_vehicles;
CREATE POLICY select_vehicles ON public.customer_vehicles FOR SELECT USING (
    customer_id = public.current_customer_id() OR public.is_owner(auth.uid()) OR
    public.has_permission(auth.uid(), 'customers.view') OR public.has_permission(auth.uid(), 'service_orders.view')
);
DROP POLICY IF EXISTS insert_vehicles ON public.customer_vehicles;
CREATE POLICY insert_vehicles ON public.customer_vehicles FOR INSERT WITH CHECK (
    customer_id = public.current_customer_id() OR public.is_owner(auth.uid()) OR
    public.has_permission(auth.uid(), 'customers.update') OR public.has_permission(auth.uid(), 'service_orders.create')
);
DROP POLICY IF EXISTS update_vehicles ON public.customer_vehicles;
CREATE POLICY update_vehicles ON public.customer_vehicles FOR UPDATE USING (
    customer_id = public.current_customer_id() OR public.is_owner(auth.uid()) OR
    public.has_permission(auth.uid(), 'customers.update') OR public.has_permission(auth.uid(), 'service_orders.update')
);
DROP POLICY IF EXISTS delete_vehicles ON public.customer_vehicles;
CREATE POLICY delete_vehicles ON public.customer_vehicles FOR DELETE USING (
    customer_id = public.current_customer_id() OR public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'customers.update')
);

DROP POLICY IF EXISTS select_service_orders ON public.service_orders;
CREATE POLICY select_service_orders ON public.service_orders FOR SELECT USING (
    customer_id = public.current_customer_id() OR public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'service_orders.view')
);

DROP POLICY IF EXISTS select_orders ON public.orders;
CREATE POLICY select_orders ON public.orders FOR SELECT USING (
    customer_id = public.current_customer_id() OR public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'orders.view')
);
DROP POLICY IF EXISTS insert_orders ON public.orders;
CREATE POLICY insert_orders ON public.orders FOR INSERT WITH CHECK (
    customer_id = public.current_customer_id()
);

DROP POLICY IF EXISTS select_order_items ON public.order_items;
CREATE POLICY select_order_items ON public.order_items FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_items.order_id AND (
            o.customer_id = public.current_customer_id() OR
            public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'orders.view')
        )
    )
);
DROP POLICY IF EXISTS insert_order_items ON public.order_items;
CREATE POLICY insert_order_items ON public.order_items FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_items.order_id AND o.customer_id = public.current_customer_id()
    )
);

DROP POLICY IF EXISTS select_quotations ON public.quotations;
CREATE POLICY select_quotations ON public.quotations FOR SELECT USING (
    customer_id = public.current_customer_id() OR public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'orders.view')
);
DROP POLICY IF EXISTS select_quotation_items ON public.quotation_items;
CREATE POLICY select_quotation_items ON public.quotation_items FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.quotations q
        WHERE q.id = quotation_items.quotation_id AND (
            q.customer_id = public.current_customer_id() OR
            public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'orders.view')
        )
    )
);

COMMIT;
