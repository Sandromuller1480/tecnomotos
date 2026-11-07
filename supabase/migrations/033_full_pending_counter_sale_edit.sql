BEGIN;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS customer_phone TEXT;

UPDATE public.orders o
SET customer_phone = q.customer_phone
FROM public.quotations q
WHERE q.id = o.quotation_id
  AND o.customer_phone IS NULL
  AND q.customer_phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_quotation_order_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.orders
    SET customer_phone = NULLIF(BTRIM(NEW.customer_phone), ''),
        updated_at = now()
    WHERE quotation_id = NEW.id
      AND status = 'pending_payment';
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_sync_quotation_order_contact ON public.quotations;
CREATE TRIGGER zz_sync_quotation_order_contact
AFTER INSERT OR UPDATE OF customer_phone ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.sync_quotation_order_contact();

REVOKE ALL ON FUNCTION public.sync_quotation_order_contact() FROM PUBLIC;

DROP FUNCTION IF EXISTS public.update_pending_counter_sale(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_pending_counter_sale(
    p_order_id UUID,
    p_items JSONB,
    p_customer_id UUID DEFAULT NULL,
    p_customer_name TEXT DEFAULT NULL,
    p_customer_email TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_title TEXT DEFAULT NULL,
    p_vehicle_info TEXT DEFAULT NULL,
    p_discount_amount NUMERIC DEFAULT 0,
    p_notes TEXT DEFAULT NULL,
    p_delivery_mode TEXT DEFAULT NULL,
    p_purchase_purpose TEXT DEFAULT NULL,
    p_taxpayer_indicator TEXT DEFAULT NULL,
    p_state_registration TEXT DEFAULT NULL,
    p_recipient_document TEXT DEFAULT NULL,
    p_freight_mode TEXT DEFAULT NULL,
    p_destination_street TEXT DEFAULT NULL,
    p_destination_number TEXT DEFAULT NULL,
    p_destination_complement TEXT DEFAULT NULL,
    p_destination_neighborhood TEXT DEFAULT NULL,
    p_destination_city TEXT DEFAULT NULL,
    p_destination_uf TEXT DEFAULT NULL,
    p_destination_postal_code TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_item RECORD;
    v_subtotal NUMERIC(12, 2) := 0;
    v_discount NUMERIC(12, 2) := GREATEST(COALESCE(p_discount_amount, 0), 0);
    v_total NUMERIC(12, 2);
    v_products_total NUMERIC(12, 2) := 0;
    v_services_total NUMERIC(12, 2) := 0;
    v_email TEXT := COALESCE(NULLIF(BTRIM(p_customer_email), ''), 'balcao@tecnomotos.local');
BEGIN
    IF auth.uid() IS NULL OR NOT (
        public.is_owner(auth.uid()) OR
        public.has_permission(auth.uid(), 'orders.update')
    ) THEN
        RAISE EXCEPTION 'Sem permissao para editar vendas.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venda nao encontrada.';
    END IF;
    IF v_order.sales_channel <> 'COUNTER' OR v_order.status <> 'pending_payment' THEN
        RAISE EXCEPTION 'Somente vendas de balcao pendentes podem ser editadas.';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Adicione ao menos um produto ou servico a venda.';
    END IF;
    IF p_customer_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.customers WHERE id = p_customer_id
    ) THEN
        RAISE EXCEPTION 'O cliente selecionado nao existe.';
    END IF;
    IF v_order.quotation_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.service_orders
        WHERE quotation_id = v_order.quotation_id
          AND status <> 'PENDING'
    ) THEN
        RAISE EXCEPTION 'A ordem de servico desta venda ja foi iniciada e a venda nao pode mais ser alterada.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.fiscal_operations WHERE sale_id = p_order_id)
       OR EXISTS (
           SELECT 1 FROM public.fiscal_documents
           WHERE sale_id = p_order_id OR order_id = p_order_id
       ) THEN
        RAISE EXCEPTION 'A venda possui historico fiscal e nao pode ser alterada.';
    END IF;

    FOR v_item IN
        SELECT *
        FROM jsonb_to_recordset(p_items) AS item(
            item_type TEXT,
            product_id UUID,
            description TEXT,
            quantity NUMERIC,
            unit_price NUMERIC
        )
    LOOP
        IF v_item.item_type NOT IN ('PRODUCT', 'SERVICE')
           OR NULLIF(BTRIM(v_item.description), '') IS NULL
           OR COALESCE(v_item.quantity, 0) <= 0
           OR COALESCE(v_item.unit_price, -1) < 0 THEN
            RAISE EXCEPTION 'A venda contem um item invalido.';
        END IF;
        IF v_item.item_type = 'PRODUCT' AND (
            v_item.product_id IS NULL OR
            NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_item.product_id)
        ) THEN
            RAISE EXCEPTION 'Todo produto precisa estar vinculado ao cadastro de produtos.';
        END IF;
        v_subtotal := v_subtotal + ROUND((v_item.quantity * v_item.unit_price)::NUMERIC, 2);
    END LOOP;

    IF v_subtotal <= 0 THEN
        RAISE EXCEPTION 'O valor da venda deve ser maior que zero.';
    END IF;
    IF v_discount > v_subtotal THEN
        RAISE EXCEPTION 'O desconto nao pode ser maior que o subtotal.';
    END IF;

    v_total := v_subtotal - v_discount;

    IF v_order.quotation_id IS NOT NULL THEN
        IF NULLIF(BTRIM(p_title), '') IS NULL THEN
            RAISE EXCEPTION 'Informe o titulo da venda/orcamento.';
        END IF;

        UPDATE public.quotations
        SET customer_id = p_customer_id,
            customer_name = NULLIF(BTRIM(p_customer_name), ''),
            customer_email = NULLIF(BTRIM(p_customer_email), ''),
            customer_phone = NULLIF(BTRIM(p_customer_phone), ''),
            title = BTRIM(p_title),
            vehicle_info = NULLIF(BTRIM(p_vehicle_info), ''),
            subtotal = v_subtotal,
            discount_amount = v_discount,
            total_amount = v_total,
            notes = NULLIF(BTRIM(p_notes), ''),
            updated_at = now()
        WHERE id = v_order.quotation_id;

        DELETE FROM public.quotation_items
        WHERE quotation_id = v_order.quotation_id;

        INSERT INTO public.quotation_items (
            quotation_id, product_id, item_type, description,
            quantity, unit_price, total_price
        )
        SELECT
            v_order.quotation_id,
            CASE WHEN item.item_type = 'PRODUCT' THEN item.product_id ELSE NULL END,
            item.item_type,
            BTRIM(item.description),
            item.quantity,
            item.unit_price,
            ROUND((item.quantity * item.unit_price)::NUMERIC, 2)
        FROM jsonb_to_recordset(p_items) AS item(
            item_type TEXT,
            product_id UUID,
            description TEXT,
            quantity NUMERIC,
            unit_price NUMERIC
        );

        -- The quotation triggers rebuild the general sale and its pending OS.
        PERFORM public.sync_approved_quotation_to_sale(v_order.quotation_id, FALSE);
    ELSE
        DELETE FROM public.order_items WHERE order_id = p_order_id;

        WITH raw AS (
            SELECT
                ordinality,
                value->>'item_type' AS item_type,
                NULLIF(value->>'product_id', '')::UUID AS product_id,
                BTRIM(value->>'description') AS description,
                (value->>'quantity')::NUMERIC AS quantity,
                (value->>'unit_price')::NUMERIC AS quoted_unit_price
            FROM jsonb_array_elements(p_items) WITH ORDINALITY AS source(value, ordinality)
        ), allocated AS (
            SELECT raw.*,
                CASE
                    WHEN ordinality = COUNT(*) OVER () THEN
                        v_total - COALESCE(
                            SUM(ROUND((quantity * quoted_unit_price * v_total / v_subtotal)::NUMERIC, 2)) OVER (
                                ORDER BY ordinality ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                            ), 0
                        )
                    ELSE ROUND((quantity * quoted_unit_price * v_total / v_subtotal)::NUMERIC, 2)
                END AS net_total
            FROM raw
        )
        INSERT INTO public.order_items (
            order_id, product_id, item_type, description, quantity,
            quoted_unit_price, unit_price, discount_amount, total_price
        )
        SELECT
            p_order_id,
            CASE WHEN item_type = 'PRODUCT' THEN product_id ELSE NULL END,
            item_type,
            description,
            quantity,
            quoted_unit_price,
            CASE WHEN quantity > 0 THEN net_total / quantity ELSE 0 END,
            ROUND((quantity * quoted_unit_price - net_total)::NUMERIC, 2),
            net_total
        FROM allocated
        ORDER BY ordinality;
    END IF;

    SELECT
        COALESCE(SUM(total_price) FILTER (WHERE item_type = 'PRODUCT'), 0),
        COALESCE(SUM(total_price) FILTER (WHERE item_type = 'SERVICE'), 0)
    INTO v_products_total, v_services_total
    FROM public.order_items
    WHERE order_id = p_order_id;

    UPDATE public.orders
    SET customer_id = p_customer_id,
        customer_name = NULLIF(BTRIM(p_customer_name), ''),
        customer_email = v_email,
        customer_phone = NULLIF(BTRIM(p_customer_phone), ''),
        total_amount = v_total,
        products_total = v_products_total,
        services_total = v_services_total,
        notes = CASE
            WHEN v_order.quotation_id IS NOT NULL THEN CONCAT_WS(
                E'\n',
                NULLIF(BTRIM(p_notes), ''),
                'Venda geral gerada pelo orcamento #' || UPPER(LEFT(v_order.quotation_id::TEXT, 8))
            )
            ELSE NULLIF(BTRIM(p_notes), '')
        END,
        delivery_mode = NULLIF(BTRIM(p_delivery_mode), ''),
        purchase_purpose = NULLIF(BTRIM(p_purchase_purpose), ''),
        fiscal_taxpayer_indicator = NULLIF(BTRIM(p_taxpayer_indicator), ''),
        fiscal_state_registration = NULLIF(BTRIM(p_state_registration), ''),
        fiscal_recipient_document = NULLIF(REGEXP_REPLACE(p_recipient_document, '\D', '', 'g'), ''),
        fiscal_freight_mode = NULLIF(BTRIM(p_freight_mode), ''),
        fiscal_destination_street = NULLIF(BTRIM(p_destination_street), ''),
        fiscal_destination_number = NULLIF(BTRIM(p_destination_number), ''),
        fiscal_destination_complement = NULLIF(BTRIM(p_destination_complement), ''),
        fiscal_destination_neighborhood = NULLIF(BTRIM(p_destination_neighborhood), ''),
        fiscal_destination_city = NULLIF(BTRIM(p_destination_city), ''),
        fiscal_destination_uf = NULLIF(UPPER(BTRIM(p_destination_uf)), ''),
        fiscal_destination_postal_code = NULLIF(REGEXP_REPLACE(p_destination_postal_code, '\D', '', 'g'), ''),
        updated_at = now()
    WHERE id = p_order_id;

    UPDATE public.fiscal_previews
    SET status = 'invalidated', invalidated_at = now()
    WHERE sale_id = p_order_id AND status = 'ready';

    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_data, new_data)
    VALUES (
        auth.uid(), 'COUNTER_SALE_FULLY_UPDATED', 'orders', p_order_id,
        jsonb_build_object('total_amount', v_order.total_amount, 'customer_name', v_order.customer_name),
        jsonb_build_object(
            'total_amount', v_total,
            'customer_name', NULLIF(BTRIM(p_customer_name), ''),
            'items_count', jsonb_array_length(p_items),
            'discount_amount', v_discount
        )
    );

    RETURN p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_pending_counter_sale(
    UUID, JSONB, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT,
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_pending_counter_sale(
    UUID, JSONB, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT,
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

COMMIT;
