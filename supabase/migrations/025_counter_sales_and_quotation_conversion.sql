-- Counter sales and automatic conversion of approved quotations into service orders.

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS sales_channel TEXT NOT NULL DEFAULT 'ONLINE'
        CONSTRAINT chk_orders_sales_channel CHECK (sales_channel IN ('ONLINE', 'COUNTER')),
    ADD COLUMN IF NOT EXISTS customer_name TEXT,
    ADD COLUMN IF NOT EXISTS payment_method TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.service_orders
    ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_orders_quotation_id
    ON public.service_orders (quotation_id)
    WHERE quotation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.complete_counter_sale(
    p_items JSONB,
    p_customer_id UUID DEFAULT NULL,
    p_customer_name TEXT DEFAULT NULL,
    p_customer_email TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'Dinheiro',
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id UUID;
    v_total NUMERIC(10, 2) := 0;
    v_item RECORD;
    v_product RECORD;
    v_email TEXT;
BEGIN
    IF auth.uid() IS NULL OR NOT (
        public.is_owner(auth.uid()) OR
        public.has_permission(auth.uid(), 'orders.update')
    ) THEN
        RAISE EXCEPTION 'Sem permissão para finalizar vendas de balcão.' USING ERRCODE = '42501';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Adicione ao menos um produto à venda.';
    END IF;

    IF COALESCE(BTRIM(p_payment_method), '') = '' THEN
        RAISE EXCEPTION 'Informe a forma de pagamento.';
    END IF;

    -- Aggregate duplicate products and lock in a stable order to keep stock updates atomic.
    FOR v_item IN
        SELECT item.product_id, SUM(item.quantity)::INTEGER AS quantity
        FROM jsonb_to_recordset(p_items) AS item(product_id UUID, quantity INTEGER)
        GROUP BY item.product_id
        ORDER BY item.product_id
    LOOP
        IF v_item.product_id IS NULL OR v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'A venda contém um item inválido.';
        END IF;

        SELECT id, name, price, stock_quantity
          INTO v_product
          FROM public.products
         WHERE id = v_item.product_id
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Um dos produtos selecionados não existe mais.';
        END IF;

        IF COALESCE(v_product.stock_quantity, 0) < v_item.quantity THEN
            RAISE EXCEPTION 'Estoque insuficiente para %. Disponível: % unidade(s).',
                v_product.name, COALESCE(v_product.stock_quantity, 0);
        END IF;

        v_total := v_total + (v_product.price * v_item.quantity);
    END LOOP;

    IF p_customer_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.customers WHERE id = p_customer_id
    ) THEN
        RAISE EXCEPTION 'O cliente selecionado não existe.';
    END IF;

    v_email := NULLIF(BTRIM(p_customer_email), '');
    IF v_email IS NULL AND p_customer_id IS NOT NULL THEN
        SELECT email INTO v_email FROM public.profiles WHERE id = p_customer_id;
    END IF;
    v_email := COALESCE(v_email, 'balcao@tecnomotos.local');

    INSERT INTO public.orders (
        customer_id,
        customer_email,
        customer_name,
        status,
        total_amount,
        payment_date,
        sales_channel,
        payment_method,
        notes
    ) VALUES (
        p_customer_id,
        v_email,
        NULLIF(BTRIM(p_customer_name), ''),
        'paid',
        v_total,
        now(),
        'COUNTER',
        BTRIM(p_payment_method),
        NULLIF(BTRIM(p_notes), '')
    )
    RETURNING id INTO v_order_id;

    FOR v_item IN
        SELECT item.product_id, SUM(item.quantity)::INTEGER AS quantity
        FROM jsonb_to_recordset(p_items) AS item(product_id UUID, quantity INTEGER)
        GROUP BY item.product_id
        ORDER BY item.product_id
    LOOP
        SELECT id, price INTO v_product
          FROM public.products
         WHERE id = v_item.product_id;

        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
        VALUES (v_order_id, v_item.product_id, v_item.quantity, v_product.price);

        UPDATE public.products
           SET stock_quantity = stock_quantity - v_item.quantity
         WHERE id = v_item.product_id;
    END LOOP;

    RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_counter_sale(JSONB, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_counter_sale(JSONB, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_approved_quotation_to_service_order(p_quotation_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quotation public.quotations%ROWTYPE;
    v_service_order_id UUID;
    v_service_description TEXT;
BEGIN
    SELECT * INTO v_quotation
      FROM public.quotations
     WHERE id = p_quotation_id;

    IF NOT FOUND OR v_quotation.status <> 'APPROVED' THEN
        RETURN NULL;
    END IF;

    SELECT string_agg(description, E'\n' ORDER BY created_at)
      INTO v_service_description
      FROM public.quotation_items
     WHERE quotation_id = p_quotation_id
       AND item_type = 'SERVICE';

    INSERT INTO public.service_orders (
        quotation_id,
        customer_id,
        service_type,
        description,
        status,
        total_price,
        notes
    ) VALUES (
        v_quotation.id,
        v_quotation.customer_id,
        v_quotation.title,
        COALESCE(v_service_description, v_quotation.title),
        'PENDING',
        v_quotation.total_amount,
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
        service_order_id,
        product_id,
        product_name,
        product_sku,
        quantity,
        unit_price,
        total_price
    )
    SELECT
        v_service_order_id,
        qi.product_id,
        qi.description,
        p.sku,
        qi.quantity,
        qi.unit_price,
        qi.total_price
    FROM public.quotation_items qi
    LEFT JOIN public.products p ON p.id = qi.product_id
    WHERE qi.quotation_id = p_quotation_id
      AND qi.item_type = 'PRODUCT';

    RETURN v_service_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_sync_approved_quotation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.sync_approved_quotation_to_service_order(
        CASE WHEN TG_OP = 'DELETE' THEN OLD.quotation_id ELSE NEW.quotation_id END
    );
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_sync_approved_quotation_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'APPROVED' THEN
        PERFORM public.sync_approved_quotation_to_service_order(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_approved_quotation_to_service_order(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_sync_approved_quotation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_sync_approved_quotation_status() FROM PUBLIC;

DROP TRIGGER IF EXISTS sync_approved_quotation_status ON public.quotations;
CREATE TRIGGER sync_approved_quotation_status
AFTER INSERT OR UPDATE OF status, customer_id, title, vehicle_info, total_amount, notes
ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.trigger_sync_approved_quotation_status();

DROP TRIGGER IF EXISTS sync_approved_quotation_items ON public.quotation_items;
CREATE TRIGGER sync_approved_quotation_items
AFTER INSERT OR UPDATE OR DELETE ON public.quotation_items
FOR EACH ROW EXECUTE FUNCTION public.trigger_sync_approved_quotation();

-- Convert quotations that had already been approved before this migration.
DO $$
DECLARE
    v_id UUID;
BEGIN
    FOR v_id IN SELECT id FROM public.quotations WHERE status = 'APPROVED' LOOP
        PERFORM public.sync_approved_quotation_to_service_order(v_id);
    END LOOP;
END;
$$;
