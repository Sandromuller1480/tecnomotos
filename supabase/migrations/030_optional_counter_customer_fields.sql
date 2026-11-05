BEGIN;

-- Physical-store customers are commercial records only. All form fields may
-- be omitted and no Supabase Auth user is created by this function.
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
    v_full_name TEXT := COALESCE(NULLIF(btrim(COALESCE(p_full_name, '')), ''), 'Cliente não identificado');
    v_email TEXT := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
    v_phone TEXT := NULLIF(btrim(COALESCE(p_phone, '')), '');
    v_document TEXT := NULLIF(regexp_replace(COALESCE(p_document, ''), '\D', '', 'g'), '');
    v_has_address BOOLEAN :=
        NULLIF(btrim(COALESCE(p_street, '')), '') IS NOT NULL OR
        NULLIF(btrim(COALESCE(p_number, '')), '') IS NOT NULL OR
        NULLIF(btrim(COALESCE(p_complement, '')), '') IS NOT NULL OR
        NULLIF(btrim(COALESCE(p_neighborhood, '')), '') IS NOT NULL OR
        NULLIF(btrim(COALESCE(p_city, '')), '') IS NOT NULL OR
        NULLIF(btrim(COALESCE(p_state, '')), '') IS NOT NULL OR
        NULLIF(regexp_replace(COALESCE(p_postal_code, ''), '\D', '', 'g'), '') IS NOT NULL;
BEGIN
    IF auth.uid() IS NULL OR NOT (
        public.is_owner(auth.uid()) OR
        public.has_permission(auth.uid(), 'customers.create')
    ) THEN
        RAISE EXCEPTION 'Sem permissão para cadastrar clientes.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.profiles (id, full_name, email, phone, avatar_url, status)
    VALUES (v_customer_id, v_full_name, v_email, v_phone, '', 'ACTIVE');

    INSERT INTO public.customers (
        id, document, birth_date, auth_user_id, registration_source, online_enabled_at
    ) VALUES (
        v_customer_id, v_document, p_birth_date, NULL, 'COUNTER', NULL
    );

    -- The legacy address table has required columns. For a partially informed
    -- counter address, missing values are stored as empty strings so no field
    -- becomes mandatory in the physical-store workflow.
    IF v_has_address THEN
        INSERT INTO public.customer_addresses (
            customer_id, street, number, complement, neighborhood,
            city, state, postal_code, is_default
        ) VALUES (
            v_customer_id,
            COALESCE(NULLIF(btrim(COALESCE(p_street, '')), ''), ''),
            COALESCE(NULLIF(btrim(COALESCE(p_number, '')), ''), ''),
            NULLIF(btrim(COALESCE(p_complement, '')), ''),
            COALESCE(NULLIF(btrim(COALESCE(p_neighborhood, '')), ''), ''),
            COALESCE(NULLIF(btrim(COALESCE(p_city, '')), ''), ''),
            upper(COALESCE(NULLIF(btrim(COALESCE(p_state, '')), ''), '')),
            COALESCE(NULLIF(regexp_replace(COALESCE(p_postal_code, ''), '\D', '', 'g'), ''), ''),
            true
        );
    END IF;

    RETURN v_customer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_counter_customer(TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_counter_customer(TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
