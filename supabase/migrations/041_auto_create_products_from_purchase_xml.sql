-- Cadastra de forma atômica os produtos ainda inexistentes durante a importação
-- de uma NF-e de compra. Produtos criados pelo XML permanecem fora da loja e
-- com revisão fiscal pendente até a conferência do cadastro comercial.

CREATE OR REPLACE FUNCTION public.save_purchase_order(
    p_id UUID,
    p_supplier_id UUID,
    p_issue_date DATE,
    p_expected_date DATE,
    p_invoice_number TEXT,
    p_invoice_series TEXT,
    p_invoice_access_key TEXT,
    p_payment_terms TEXT,
    p_payment_method TEXT,
    p_freight_amount NUMERIC,
    p_discount_amount NUMERIC,
    p_notes TEXT,
    p_items JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    purchase_id UUID;
    item JSONB;
    xml_product JSONB;
    product_record public.products%ROWTYPE;
    supplier_code TEXT;
    product_name TEXT;
    product_sku TEXT;
    product_gtin TEXT;
    product_ncm TEXT;
    product_cest TEXT;
    commercial_unit TEXT;
    taxable_unit TEXT;
    fiscal_origin INTEGER;
    item_quantity NUMERIC;
    item_unit_cost NUMERIC;
    item_discount NUMERIC;
BEGIN
    IF NOT (public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), CASE WHEN p_id IS NULL THEN 'purchases.create' ELSE 'purchases.update' END)) THEN
        RAISE EXCEPTION 'Acesso negado para salvar compras.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier_id AND active) THEN
        RAISE EXCEPTION 'Selecione um fornecedor ativo.';
    END IF;
    IF p_issue_date IS NULL OR (p_expected_date IS NOT NULL AND p_expected_date < p_issue_date) THEN
        RAISE EXCEPTION 'Informe datas válidas para a compra.';
    END IF;
    IF NULLIF(BTRIM(COALESCE(p_invoice_access_key, '')), '') IS NOT NULL AND BTRIM(p_invoice_access_key) !~ '^[0-9]{44}$' THEN
        RAISE EXCEPTION 'A chave da NF-e de compra deve conter 44 dígitos.';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Inclua ao menos um produto na compra.';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO public.purchase_orders (
            supplier_id, issue_date, expected_date, invoice_number, invoice_series,
            invoice_access_key, payment_terms, payment_method, freight_amount,
            discount_amount, notes, created_by, updated_by
        ) VALUES (
            p_supplier_id, p_issue_date, p_expected_date, NULLIF(BTRIM(COALESCE(p_invoice_number, '')), ''),
            NULLIF(BTRIM(COALESCE(p_invoice_series, '')), ''), NULLIF(BTRIM(COALESCE(p_invoice_access_key, '')), ''),
            NULLIF(BTRIM(COALESCE(p_payment_terms, '')), ''), NULLIF(BTRIM(COALESCE(p_payment_method, '')), ''),
            GREATEST(COALESCE(p_freight_amount, 0), 0), GREATEST(COALESCE(p_discount_amount, 0), 0),
            NULLIF(BTRIM(COALESCE(p_notes, '')), ''), auth.uid(), auth.uid()
        ) RETURNING id INTO purchase_id;
    ELSE
        UPDATE public.purchase_orders SET
            supplier_id = p_supplier_id, issue_date = p_issue_date, expected_date = p_expected_date,
            invoice_number = NULLIF(BTRIM(COALESCE(p_invoice_number, '')), ''),
            invoice_series = NULLIF(BTRIM(COALESCE(p_invoice_series, '')), ''),
            invoice_access_key = NULLIF(BTRIM(COALESCE(p_invoice_access_key, '')), ''),
            payment_terms = NULLIF(BTRIM(COALESCE(p_payment_terms, '')), ''),
            payment_method = NULLIF(BTRIM(COALESCE(p_payment_method, '')), ''),
            freight_amount = GREATEST(COALESCE(p_freight_amount, 0), 0),
            discount_amount = GREATEST(COALESCE(p_discount_amount, 0), 0),
            notes = NULLIF(BTRIM(COALESCE(p_notes, '')), ''), updated_by = auth.uid()
        WHERE id = p_id AND status = 'draft'
        RETURNING id INTO purchase_id;
        IF purchase_id IS NULL THEN RAISE EXCEPTION 'Somente compras em rascunho podem ser editadas.'; END IF;
        DELETE FROM public.purchase_order_items WHERE purchase_order_id = purchase_id;
    END IF;

    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        item_quantity := COALESCE((item->>'quantity')::NUMERIC, 0);
        item_unit_cost := COALESCE((item->>'unit_cost')::NUMERIC, -1);
        item_discount := GREATEST(COALESCE((item->>'discount_amount')::NUMERIC, 0), 0);
        IF item_quantity <= 0 OR item_unit_cost < 0 THEN
            RAISE EXCEPTION 'Quantidade e custo dos itens devem ser válidos.';
        END IF;

        supplier_code := NULLIF(BTRIM(COALESCE(item->>'supplier_product_code', '')), '');
        product_record := NULL;

        IF NULLIF(BTRIM(COALESCE(item->>'product_id', '')), '') IS NOT NULL THEN
            BEGIN
                SELECT * INTO product_record
                FROM public.products
                WHERE id = (item->>'product_id')::UUID;
            EXCEPTION WHEN invalid_text_representation THEN
                RAISE EXCEPTION 'Um dos produtos selecionados possui identificador inválido.';
            END;
            IF product_record.id IS NULL THEN RAISE EXCEPTION 'Um dos produtos selecionados não existe.'; END IF;
        ELSE
            xml_product := item->'xml_product';
            product_name := NULLIF(BTRIM(COALESCE(xml_product->>'name', '')), '');
            IF xml_product IS NULL OR jsonb_typeof(xml_product) <> 'object' OR product_name IS NULL THEN
                RAISE EXCEPTION 'Informe o produto ou os dados do item importado do XML.';
            END IF;

            product_gtin := NULLIF(regexp_replace(COALESCE(xml_product->>'gtin', ''), '[^0-9]', '', 'g'), '');
            IF product_gtin IS NOT NULL AND NOT public.is_valid_gtin(product_gtin) THEN product_gtin := NULL; END IF;

            IF product_gtin IS NOT NULL THEN
                SELECT * INTO product_record FROM public.products WHERE gtin = product_gtin ORDER BY created_at LIMIT 1;
            END IF;

            IF product_record.id IS NULL AND supplier_code IS NOT NULL THEN
                SELECT * INTO product_record
                FROM public.products
                WHERE LOWER(BTRIM(sku)) = LOWER(supplier_code)
                ORDER BY created_at
                LIMIT 1;
            END IF;

            IF product_record.id IS NULL AND supplier_code IS NOT NULL THEN
                SELECT product.* INTO product_record
                FROM public.purchase_order_items purchase_item
                JOIN public.purchase_orders purchase ON purchase.id = purchase_item.purchase_order_id
                JOIN public.products product ON product.id = purchase_item.product_id
                WHERE purchase.supplier_id = p_supplier_id
                  AND LOWER(BTRIM(purchase_item.supplier_product_code)) = LOWER(supplier_code)
                ORDER BY purchase_item.created_at DESC
                LIMIT 1;
            END IF;

            IF product_record.id IS NULL AND (
                SELECT COUNT(*) FROM public.products WHERE LOWER(BTRIM(name)) = LOWER(product_name)
            ) = 1 THEN
                SELECT * INTO product_record
                FROM public.products
                WHERE LOWER(BTRIM(name)) = LOWER(product_name)
                LIMIT 1;
            END IF;

            IF product_record.id IS NULL THEN
                product_ncm := NULLIF(regexp_replace(COALESCE(xml_product->>'ncm', ''), '[^0-9]', '', 'g'), '');
                IF product_ncm IS NOT NULL AND product_ncm !~ '^[0-9]{8}$' THEN product_ncm := NULL; END IF;
                product_cest := NULLIF(regexp_replace(COALESCE(xml_product->>'cest', ''), '[^0-9]', '', 'g'), '');
                IF product_cest IS NOT NULL AND product_cest !~ '^[0-9]{7}$' THEN product_cest := NULL; END IF;
                commercial_unit := COALESCE(NULLIF(UPPER(BTRIM(xml_product->>'commercial_unit')), ''), 'UN');
                taxable_unit := COALESCE(NULLIF(UPPER(BTRIM(xml_product->>'taxable_unit')), ''), commercial_unit);
                fiscal_origin := CASE
                    WHEN COALESCE(xml_product->>'fiscal_origin', '') ~ '^[0-8]$' THEN (xml_product->>'fiscal_origin')::INTEGER
                    ELSE NULL
                END;

                product_sku := NULLIF(TRIM(BOTH '-' FROM regexp_replace(UPPER(COALESCE(supplier_code, '')), '[^A-Z0-9]+', '-', 'g')), '');
                product_sku := LEFT(product_sku, 64);
                IF product_sku IS NULL OR EXISTS (SELECT 1 FROM public.products WHERE LOWER(sku) = LOWER(product_sku)) THEN
                    product_sku := 'TM-XML-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 12));
                END IF;

                INSERT INTO public.products (
                    sku, name, price, cost_price, stock_quantity, min_stock_quantity,
                    gtin, barcode, without_gtin, ncm, cest, origin, fiscal_origin,
                    unit, taxable_unit, show_in_store, preferred_supplier_id,
                    fiscal_review_notes
                ) VALUES (
                    product_sku, product_name, 0, item_unit_cost, 0, 0,
                    product_gtin, product_gtin, product_gtin IS NULL, product_ncm, product_cest,
                    fiscal_origin, fiscal_origin, commercial_unit, taxable_unit, false,
                    p_supplier_id,
                    'Produto criado automaticamente pela importação de XML da NF-e. Confira preço de venda e classificação fiscal.'
                ) RETURNING * INTO product_record;
            END IF;
        END IF;

        INSERT INTO public.purchase_order_items (
            purchase_order_id, product_id, supplier_product_code, product_name, product_sku,
            quantity_ordered, unit_cost, discount_amount, notes
        ) VALUES (
            purchase_id, product_record.id, supplier_code, product_record.name, product_record.sku,
            item_quantity, item_unit_cost, item_discount,
            NULLIF(BTRIM(COALESCE(item->>'notes', '')), '')
        )
        ON CONFLICT (purchase_order_id, product_id) DO UPDATE SET
            quantity_ordered = purchase_order_items.quantity_ordered + EXCLUDED.quantity_ordered,
            unit_cost = ROUND((
                (purchase_order_items.quantity_ordered * purchase_order_items.unit_cost)
                + (EXCLUDED.quantity_ordered * EXCLUDED.unit_cost)
            ) / (purchase_order_items.quantity_ordered + EXCLUDED.quantity_ordered), 4),
            discount_amount = purchase_order_items.discount_amount + EXCLUDED.discount_amount,
            supplier_product_code = COALESCE(purchase_order_items.supplier_product_code, EXCLUDED.supplier_product_code),
            notes = CONCAT_WS('; ', purchase_order_items.notes, EXCLUDED.notes);
    END LOOP;

    UPDATE public.purchase_orders SET updated_at = now() WHERE id = purchase_id;
    RETURN purchase_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_purchase_order(UUID, UUID, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_purchase_order(UUID, UUID, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB) TO authenticated;
