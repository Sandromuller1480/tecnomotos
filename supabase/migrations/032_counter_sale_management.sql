BEGIN;

-- Administrative management for counter sales shown in the sales report.
-- Payment confirmation is atomic: the order lock makes repeated clicks safe
-- and product stock is validated and deducted in the same transaction.
CREATE OR REPLACE FUNCTION public.confirm_counter_sale_payment(
    p_order_id UUID,
    p_payment_method TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_item RECORD;
    v_product public.products%ROWTYPE;
    v_method TEXT := NULLIF(BTRIM(p_payment_method), '');
BEGIN
    IF auth.uid() IS NULL OR NOT (
        public.is_owner(auth.uid()) OR
        public.has_permission(auth.uid(), 'orders.update')
    ) THEN
        RAISE EXCEPTION 'Sem permissao para confirmar pagamentos.' USING ERRCODE = '42501';
    END IF;

    IF v_method IS NULL THEN
        RAISE EXCEPTION 'Informe a forma de pagamento.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venda nao encontrada.';
    END IF;
    IF v_order.sales_channel <> 'COUNTER' THEN
        RAISE EXCEPTION 'O pagamento de vendas online deve ser confirmado pelo provedor de pagamento.';
    END IF;
    IF v_order.status = 'paid' THEN
        RETURN v_order.id;
    END IF;
    IF v_order.status <> 'pending_payment' THEN
        RAISE EXCEPTION 'Somente vendas pendentes podem ser pagas.';
    END IF;

    FOR v_item IN
        SELECT oi.product_id, SUM(oi.quantity) AS quantity
        FROM public.order_items oi
        WHERE oi.order_id = p_order_id
          AND oi.item_type = 'PRODUCT'
        GROUP BY oi.product_id
        ORDER BY oi.product_id
    LOOP
        SELECT * INTO v_product
        FROM public.products
        WHERE id = v_item.product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Um produto desta venda nao existe mais.';
        END IF;
        IF COALESCE(v_product.stock_quantity, 0) < v_item.quantity THEN
            RAISE EXCEPTION 'Estoque insuficiente para %. Disponivel: % unidade(s).',
                v_product.name, COALESCE(v_product.stock_quantity, 0);
        END IF;

        UPDATE public.products
        SET stock_quantity = stock_quantity - v_item.quantity
        WHERE id = v_product.id;

        INSERT INTO public.inventory_movements (
            product_id, movement_type, quantity_delta, balance_before,
            balance_after, reason, created_by
        ) VALUES (
            v_product.id, 'sale', -v_item.quantity, v_product.stock_quantity,
            v_product.stock_quantity - v_item.quantity,
            'Pagamento da venda #' || UPPER(LEFT(p_order_id::TEXT, 8)), auth.uid()
        );
    END LOOP;

    UPDATE public.orders
    SET status = 'paid',
        payment_method = v_method,
        payment_date = now(),
        updated_at = now()
    WHERE id = p_order_id;

    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_data, new_data)
    VALUES (
        auth.uid(), 'COUNTER_SALE_PAYMENT_CONFIRMED', 'orders', p_order_id,
        jsonb_build_object('status', v_order.status, 'payment_method', v_order.payment_method),
        jsonb_build_object('status', 'paid', 'payment_method', v_method)
    );

    RETURN p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_pending_counter_sale(
    p_order_id UUID,
    p_customer_name TEXT DEFAULT NULL,
    p_customer_email TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
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

    UPDATE public.orders
    SET customer_name = NULLIF(BTRIM(p_customer_name), ''),
        customer_email = v_email,
        notes = NULLIF(BTRIM(p_notes), ''),
        updated_at = now()
    WHERE id = p_order_id;

    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_data, new_data)
    VALUES (
        auth.uid(), 'COUNTER_SALE_UPDATED', 'orders', p_order_id,
        jsonb_build_object(
            'customer_name', v_order.customer_name,
            'customer_email', v_order.customer_email,
            'notes', v_order.notes
        ),
        jsonb_build_object(
            'customer_name', NULLIF(BTRIM(p_customer_name), ''),
            'customer_email', v_email,
            'notes', NULLIF(BTRIM(p_notes), '')
        )
    );

    RETURN p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_pending_counter_sale(p_order_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR NOT (
        public.is_owner(auth.uid()) OR
        public.has_permission(auth.uid(), 'orders.update')
    ) THEN
        RAISE EXCEPTION 'Sem permissao para excluir vendas.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venda nao encontrada.';
    END IF;
    IF v_order.sales_channel <> 'COUNTER' OR v_order.status <> 'pending_payment' THEN
        RAISE EXCEPTION 'Somente vendas de balcao pendentes podem ser excluidas.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.fiscal_operations WHERE sale_id = p_order_id)
       OR EXISTS (
           SELECT 1 FROM public.fiscal_documents
           WHERE sale_id = p_order_id OR order_id = p_order_id
       ) THEN
        RAISE EXCEPTION 'A venda possui historico fiscal e nao pode ser excluida.';
    END IF;

    DELETE FROM public.orders WHERE id = p_order_id;

    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_data)
    VALUES (auth.uid(), 'COUNTER_SALE_DELETED', 'orders', p_order_id, to_jsonb(v_order));

    RETURN p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_counter_sale_payment(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_pending_counter_sale(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_pending_counter_sale(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.confirm_counter_sale_payment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_pending_counter_sale(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pending_counter_sale(UUID) TO authenticated;

COMMIT;
