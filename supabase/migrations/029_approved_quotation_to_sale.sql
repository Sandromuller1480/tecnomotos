BEGIN;

-- One approved quotation produces one general sale. Product and service totals
-- remain separated so each fiscal document can be issued independently later.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES public.quotations(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS products_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS services_total NUMERIC(12, 2) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_quotation_id
    ON public.orders (quotation_id)
    WHERE quotation_id IS NOT NULL;

ALTER TABLE public.order_items
    ALTER COLUMN product_id DROP NOT NULL,
    ALTER COLUMN quantity TYPE NUMERIC(10, 2),
    ALTER COLUMN unit_price TYPE NUMERIC(12, 4),
    ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'PRODUCT',
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS quoted_unit_price NUMERIC(12, 4),
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_price NUMERIC(12, 2);

UPDATE public.order_items oi
SET item_type = 'PRODUCT',
    description = COALESCE(oi.description, p.name, 'Produto'),
    quoted_unit_price = COALESCE(oi.quoted_unit_price, oi.unit_price),
    total_price = COALESCE(oi.total_price, ROUND((oi.quantity * oi.unit_price)::NUMERIC, 2))
FROM public.products p
WHERE p.id = oi.product_id;

UPDATE public.order_items
SET description = COALESCE(description, 'Item da venda'),
    quoted_unit_price = COALESCE(quoted_unit_price, unit_price),
    total_price = COALESCE(total_price, ROUND((quantity * unit_price)::NUMERIC, 2));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'order_items_item_type_check'
          AND conrelid = 'public.order_items'::regclass
    ) THEN
        ALTER TABLE public.order_items
            ADD CONSTRAINT order_items_item_type_check
            CHECK (item_type IN ('PRODUCT', 'SERVICE'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'order_items_product_reference_check'
          AND conrelid = 'public.order_items'::regclass
    ) THEN
        ALTER TABLE public.order_items
            ADD CONSTRAINT order_items_product_reference_check
            CHECK (item_type <> 'PRODUCT' OR product_id IS NOT NULL);
    END IF;
END $$;

-- Replace the old OS-only synchronization.
DROP TRIGGER IF EXISTS sync_approved_quotation_items ON public.quotation_items;
DROP TRIGGER IF EXISTS sync_approved_quotation_status ON public.quotations;
DROP FUNCTION IF EXISTS public.trigger_sync_approved_quotation();
DROP FUNCTION IF EXISTS public.trigger_sync_approved_quotation_status();
DROP FUNCTION IF EXISTS public.sync_approved_quotation_to_service_order(UUID);

CREATE OR REPLACE FUNCTION public.sync_approved_quotation_to_sale(
    p_quotation_id UUID,
    p_preserve_started_service_order BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quotation public.quotations%ROWTYPE;
    v_order_id UUID;
    v_existing_order_status TEXT;
    v_service_order_id UUID;
    v_existing_service_status TEXT;
    v_email TEXT;
    v_items_subtotal NUMERIC(12, 2);
    v_ratio NUMERIC;
    v_product_total NUMERIC(12, 2) := 0;
    v_service_total NUMERIC(12, 2) := 0;
    v_service_count INTEGER := 0;
    v_service_description TEXT;
BEGIN
    SELECT * INTO v_quotation
    FROM public.quotations
    WHERE id = p_quotation_id
    FOR UPDATE;

    IF NOT FOUND OR v_quotation.status <> 'APPROVED' THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM(qi.total_price), 0),
           COUNT(*) FILTER (WHERE qi.item_type = 'SERVICE')
      INTO v_items_subtotal, v_service_count
    FROM public.quotation_items qi
    WHERE qi.quotation_id = p_quotation_id;

    -- During quotation editing the UI briefly deletes all rows before inserting
    -- the replacement set. Keep the prior conversion until the new rows arrive.
    IF v_items_subtotal <= 0 THEN
        SELECT id INTO v_order_id FROM public.orders WHERE quotation_id = p_quotation_id;
        SELECT id INTO v_service_order_id FROM public.service_orders WHERE quotation_id = p_quotation_id;
        RETURN jsonb_build_object('order_id', v_order_id, 'service_order_id', v_service_order_id);
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.quotation_items
        WHERE quotation_id = p_quotation_id
          AND item_type = 'PRODUCT'
          AND product_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Todo produto do orçamento precisa estar vinculado ao cadastro de produtos.';
    END IF;

    SELECT id, status INTO v_order_id, v_existing_order_status
    FROM public.orders
    WHERE quotation_id = p_quotation_id;

    IF v_existing_order_status = 'paid' THEN
        RAISE EXCEPTION 'A venda deste orçamento já foi paga e o orçamento não pode mais ser alterado.';
    END IF;

    SELECT id, status INTO v_service_order_id, v_existing_service_status
    FROM public.service_orders
    WHERE quotation_id = p_quotation_id;

    IF v_existing_service_status IS NOT NULL
       AND v_existing_service_status <> 'PENDING'
       AND NOT p_preserve_started_service_order THEN
        RAISE EXCEPTION 'A ordem de serviço deste orçamento já está em execução e não pode ser recriada.';
    END IF;

    v_ratio := GREATEST(v_quotation.total_amount, 0) / v_items_subtotal;
    v_email := NULLIF(BTRIM(v_quotation.customer_email), '');
    IF v_email IS NULL AND v_quotation.customer_id IS NOT NULL THEN
        SELECT email INTO v_email FROM public.profiles WHERE id = v_quotation.customer_id;
    END IF;
    v_email := COALESCE(v_email, 'balcao@tecnomotos.local');

    INSERT INTO public.orders (
        quotation_id, customer_id, customer_email, customer_name, status,
        total_amount, products_total, services_total, sales_channel,
        payment_method, notes
    ) VALUES (
        v_quotation.id, v_quotation.customer_id, v_email,
        NULLIF(BTRIM(v_quotation.customer_name), ''), 'pending_payment',
        v_quotation.total_amount, 0, 0, 'COUNTER', NULL,
        CONCAT_WS(E'\n', v_quotation.notes,
            'Venda geral gerada pelo orçamento #' || UPPER(LEFT(v_quotation.id::TEXT, 8)))
    )
    ON CONFLICT (quotation_id) WHERE quotation_id IS NOT NULL
    DO UPDATE SET
        customer_id = EXCLUDED.customer_id,
        customer_email = EXCLUDED.customer_email,
        customer_name = EXCLUDED.customer_name,
        total_amount = EXCLUDED.total_amount,
        products_total = 0,
        services_total = 0,
        notes = EXCLUDED.notes,
        updated_at = now()
    RETURNING id INTO v_order_id;

    DELETE FROM public.order_items WHERE order_id = v_order_id;

    WITH ranked AS (
        SELECT qi.*,
               ROW_NUMBER() OVER (ORDER BY qi.created_at, qi.id) AS row_number,
               COUNT(*) OVER () AS row_count
        FROM public.quotation_items qi
        WHERE qi.quotation_id = p_quotation_id
    ), rounded AS (
        SELECT ranked.*,
               ROUND((ranked.total_price * v_ratio)::NUMERIC, 2) AS rounded_total
        FROM ranked
    ), allocated AS (
        SELECT rounded.*,
               CASE
                   WHEN row_number = row_count THEN
                       v_quotation.total_amount - COALESCE(
                           SUM(rounded_total) OVER (
                               ORDER BY created_at, id
                               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                           ), 0
                       )
                   ELSE rounded_total
               END AS net_total
        FROM rounded
    )
    INSERT INTO public.order_items (
        order_id, product_id, item_type, description, quantity,
        quoted_unit_price, unit_price, discount_amount, total_price
    )
    SELECT
        v_order_id,
        product_id,
        item_type,
        description,
        quantity,
        unit_price,
        CASE WHEN quantity > 0 THEN net_total / quantity ELSE 0 END,
        total_price - net_total,
        net_total
    FROM allocated
    ORDER BY created_at, id;

    SELECT COALESCE(SUM(total_price) FILTER (WHERE item_type = 'PRODUCT'), 0),
           COALESCE(SUM(total_price) FILTER (WHERE item_type = 'SERVICE'), 0)
      INTO v_product_total, v_service_total
    FROM public.order_items
    WHERE order_id = v_order_id;

    UPDATE public.orders
    SET products_total = v_product_total,
        services_total = v_service_total,
        updated_at = now()
    WHERE id = v_order_id;

    IF v_service_count > 0
       AND (v_existing_service_status IS NULL OR v_existing_service_status = 'PENDING') THEN
        SELECT string_agg(
                   CASE WHEN quantity <> 1
                        THEN quantity::TEXT || 'x ' || description
                        ELSE description END,
                   E'\n' ORDER BY created_at, id
               )
          INTO v_service_description
        FROM public.quotation_items
        WHERE quotation_id = p_quotation_id
          AND item_type = 'SERVICE';

        INSERT INTO public.service_orders (
            quotation_id, customer_id, service_type, description,
            status, total_price, notes
        ) VALUES (
            v_quotation.id, v_quotation.customer_id, v_quotation.title,
            v_service_description, 'PENDING', v_service_total,
            CONCAT_WS(E'\n',
                NULLIF('Veículo informado: ' || COALESCE(v_quotation.vehicle_info, ''), 'Veículo informado: '),
                v_quotation.notes,
                'Gerada automaticamente pelo orçamento #' || UPPER(LEFT(v_quotation.id::TEXT, 8))
            )
        )
        ON CONFLICT (quotation_id) WHERE quotation_id IS NOT NULL
        DO UPDATE SET
            customer_id = EXCLUDED.customer_id,
            service_type = EXCLUDED.service_type,
            description = EXCLUDED.description,
            total_price = EXCLUDED.total_price,
            notes = EXCLUDED.notes,
            updated_at = now()
        RETURNING id INTO v_service_order_id;

        DELETE FROM public.service_order_products
        WHERE service_order_id = v_service_order_id;

        INSERT INTO public.service_order_products (
            service_order_id, product_id, product_name, product_sku,
            quantity, unit_price, total_price
        )
        SELECT
            v_service_order_id, oi.product_id, oi.description, p.sku,
            oi.quantity, oi.unit_price, oi.total_price
        FROM public.order_items oi
        LEFT JOIN public.products p ON p.id = oi.product_id
        WHERE oi.order_id = v_order_id
          AND oi.item_type = 'PRODUCT';
    ELSIF v_service_count = 0
          AND (v_existing_service_status IS NULL OR v_existing_service_status = 'PENDING') THEN
        DELETE FROM public.service_orders
        WHERE quotation_id = p_quotation_id
          AND status = 'PENDING';
        v_service_order_id := NULL;
    END IF;

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'service_order_id', v_service_order_id,
        'products_total', v_product_total,
        'services_total', v_service_total,
        'total_amount', v_quotation.total_amount
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_sync_approved_quotation_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.sync_approved_quotation_to_sale(
        CASE WHEN TG_OP = 'DELETE' THEN OLD.quotation_id ELSE NEW.quotation_id END
    );
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_sync_approved_quotation_sale_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'APPROVED' THEN
        PERFORM public.sync_approved_quotation_to_sale(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_approved_quotation_to_sale(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_sync_approved_quotation_sale() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_sync_approved_quotation_sale_status() FROM PUBLIC;

CREATE TRIGGER sync_approved_quotation_status
AFTER INSERT OR UPDATE OF status, customer_id, customer_name, customer_email,
    title, vehicle_info, total_amount, notes
ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.trigger_sync_approved_quotation_sale_status();

CREATE TRIGGER sync_approved_quotation_items
AFTER INSERT OR UPDATE OR DELETE ON public.quotation_items
FOR EACH ROW EXECUTE FUNCTION public.trigger_sync_approved_quotation_sale();

-- Generate missing sales for quotations approved before this migration and
-- correct the old behavior that created OS records for product-only quotations.
DO $$
DECLARE
    v_id UUID;
BEGIN
    FOR v_id IN SELECT id FROM public.quotations WHERE status = 'APPROVED' LOOP
        PERFORM public.sync_approved_quotation_to_sale(v_id, TRUE);
    END LOOP;
END;
$$;

COMMIT;
