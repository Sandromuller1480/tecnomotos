-- Product purchasing, suppliers, document archive and stock/cost integration.

INSERT INTO public.permissions (key, description) VALUES
    ('purchases.view', 'Visualizar fornecedores e compras de produtos.'),
    ('purchases.create', 'Cadastrar fornecedores e novas compras.'),
    ('purchases.update', 'Editar, confirmar e cancelar compras.'),
    ('purchases.receive', 'Receber compras e lançar produtos no estoque.'),
    ('purchases.delete', 'Excluir compras ainda não recebidas.')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
    employee_role_id UUID;
    permission_id UUID;
    permission_key TEXT;
BEGIN
    SELECT id INTO employee_role_id FROM public.roles WHERE name = 'EMPLOYEE';
    IF employee_role_id IS NOT NULL THEN
        FOREACH permission_key IN ARRAY ARRAY['purchases.view', 'purchases.create', 'purchases.update', 'purchases.receive'] LOOP
            SELECT id INTO permission_id FROM public.permissions WHERE key = permission_key;
            INSERT INTO public.role_permissions (role_id, permission_id)
            VALUES (employee_role_id, permission_id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name TEXT NOT NULL,
    trade_name TEXT,
    document TEXT,
    state_registration TEXT,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    postal_code TEXT,
    street TEXT,
    number TEXT,
    complement TEXT,
    neighborhood TEXT,
    city TEXT,
    state TEXT,
    payment_terms TEXT,
    lead_time_days INTEGER NOT NULL DEFAULT 0 CHECK (lead_time_days >= 0),
    minimum_order_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (minimum_order_value >= 0),
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_document_unique
ON public.suppliers (regexp_replace(document, '[^0-9]', '', 'g'))
WHERE NULLIF(regexp_replace(document, '[^0-9]', '', 'g'), '') IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.purchase_order_number_seq;

CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE DEFAULT (
        'CP-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('public.purchase_order_number_seq')::TEXT, 6, '0')
    ),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'partial', 'received', 'cancelled')),
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_date DATE,
    received_at TIMESTAMPTZ,
    invoice_number TEXT,
    invoice_series TEXT,
    invoice_access_key TEXT CHECK (invoice_access_key IS NULL OR invoice_access_key ~ '^[0-9]{44}$'),
    payment_terms TEXT,
    payment_method TEXT,
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    freight_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (freight_amount >= 0),
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expected_date IS NULL OR expected_date >= issue_date)
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    supplier_product_code TEXT,
    product_name TEXT NOT NULL,
    product_sku TEXT,
    quantity_ordered NUMERIC(14,3) NOT NULL CHECK (quantity_ordered > 0),
    quantity_received NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0 AND quantity_received <= quantity_ordered),
    unit_cost NUMERIC(14,4) NOT NULL CHECK (unit_cost >= 0),
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount NUMERIC(14,2) GENERATED ALWAYS AS (
        round((quantity_ordered * unit_cost) - discount_amount, 2)
    ) STORED,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (purchase_order_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.purchase_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('invoice_pdf', 'invoice_xml', 'boleto', 'receipt', 'quotation', 'other')),
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE,
    mime_type TEXT,
    file_size BIGINT CHECK (file_size IS NULL OR file_size >= 0),
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS last_purchase_cost NUMERIC(14,4),
    ADD COLUMN IF NOT EXISTS average_purchase_cost NUMERIC(14,4),
    ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS preferred_supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.products ALTER COLUMN stock_quantity TYPE NUMERIC(14,3) USING stock_quantity::NUMERIC;
ALTER TABLE public.products ALTER COLUMN min_stock_quantity TYPE NUMERIC(14,3) USING min_stock_quantity::NUMERIC;

ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
CHECK (movement_type IN ('initial', 'adjustment', 'purchase', 'sale', 'return'));

ALTER TABLE public.financial_transactions DROP CONSTRAINT IF EXISTS chk_financial_source;
ALTER TABLE public.financial_transactions ADD CONSTRAINT chk_financial_source
CHECK (source IN ('MANUAL', 'ORDER', 'SERVICE_ORDER', 'INVENTORY', 'FISCAL', 'PURCHASE'));

CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON public.purchase_orders(supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status, expected_date);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON public.purchase_order_items(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_order ON public.purchase_documents(purchase_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_replenishment ON public.products(stock_quantity, min_stock_quantity);

DROP TRIGGER IF EXISTS update_suppliers_modtime ON public.suppliers;
CREATE TRIGGER update_suppliers_modtime BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE PROCEDURE public.update_modified_column();

DROP TRIGGER IF EXISTS update_purchase_orders_modtime ON public.purchase_orders;
CREATE TRIGGER update_purchase_orders_modtime BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE PROCEDURE public.update_modified_column();

CREATE OR REPLACE FUNCTION public.recalculate_purchase_order_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    target_id UUID;
BEGIN
    target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.purchase_order_id ELSE NEW.purchase_order_id END;
    UPDATE public.purchase_orders purchase
    SET subtotal = totals.subtotal,
        total_amount = GREATEST(totals.subtotal + purchase.freight_amount - purchase.discount_amount, 0)
    FROM (
        SELECT COALESCE(SUM(total_amount), 0)::NUMERIC(14,2) AS subtotal
        FROM public.purchase_order_items
        WHERE purchase_order_id = target_id
    ) totals
    WHERE purchase.id = target_id;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS recalculate_purchase_totals_trigger ON public.purchase_order_items;
CREATE TRIGGER recalculate_purchase_totals_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
FOR EACH ROW EXECUTE PROCEDURE public.recalculate_purchase_order_totals();

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
    product_record public.products%ROWTYPE;
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
        SELECT * INTO product_record FROM public.products WHERE id = (item->>'product_id')::UUID;
        IF NOT FOUND THEN RAISE EXCEPTION 'Um dos produtos selecionados não existe.'; END IF;
        IF COALESCE((item->>'quantity')::NUMERIC, 0) <= 0 OR COALESCE((item->>'unit_cost')::NUMERIC, -1) < 0 THEN
            RAISE EXCEPTION 'Quantidade e custo dos itens devem ser válidos.';
        END IF;
        INSERT INTO public.purchase_order_items (
            purchase_order_id, product_id, supplier_product_code, product_name, product_sku,
            quantity_ordered, unit_cost, discount_amount, notes
        ) VALUES (
            purchase_id, product_record.id, NULLIF(BTRIM(COALESCE(item->>'supplier_product_code', '')), ''),
            product_record.name, product_record.sku, (item->>'quantity')::NUMERIC,
            (item->>'unit_cost')::NUMERIC, GREATEST(COALESCE((item->>'discount_amount')::NUMERIC, 0), 0),
            NULLIF(BTRIM(COALESCE(item->>'notes', '')), '')
        );
    END LOOP;

    UPDATE public.purchase_orders SET updated_at = now() WHERE id = purchase_id;
    RETURN purchase_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_purchase_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    purchase public.purchase_orders%ROWTYPE;
    item public.purchase_order_items%ROWTYPE;
    product public.products%ROWTYPE;
    quantity_to_receive NUMERIC(14,3);
    balance_before NUMERIC(14,3);
    balance_after NUMERIC(14,3);
    average_cost NUMERIC(14,4);
BEGIN
    IF NOT (public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.receive')) THEN
        RAISE EXCEPTION 'Acesso negado para receber compras.';
    END IF;
    SELECT * INTO purchase FROM public.purchase_orders WHERE id = p_purchase_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Compra não encontrada.'; END IF;
    IF purchase.status IN ('received', 'cancelled') THEN RAISE EXCEPTION 'Esta compra não pode ser recebida.'; END IF;

    FOR item IN SELECT * FROM public.purchase_order_items WHERE purchase_order_id = p_purchase_id FOR UPDATE
    LOOP
        quantity_to_receive := item.quantity_ordered - item.quantity_received;
        IF quantity_to_receive <= 0 THEN CONTINUE; END IF;
        SELECT * INTO product FROM public.products WHERE id = item.product_id FOR UPDATE;
        balance_before := COALESCE(product.stock_quantity, 0);
        balance_after := balance_before + quantity_to_receive;
        average_cost := CASE
            WHEN balance_after > 0 THEN round(((balance_before * COALESCE(product.average_purchase_cost, product.cost_price, 0)) + (quantity_to_receive * item.unit_cost)) / balance_after, 4)
            ELSE item.unit_cost
        END;

        UPDATE public.products SET
            stock_quantity = balance_after,
            cost_price = item.unit_cost,
            last_purchase_cost = item.unit_cost,
            average_purchase_cost = average_cost,
            last_purchase_at = now(),
            preferred_supplier_id = purchase.supplier_id
        WHERE id = item.product_id;

        UPDATE public.purchase_order_items SET quantity_received = quantity_ordered WHERE id = item.id;
        INSERT INTO public.inventory_movements (
            product_id, movement_type, quantity_delta, balance_before, balance_after, reason, created_by
        ) VALUES (
            item.product_id, 'purchase', quantity_to_receive, balance_before, balance_after,
            'Recebimento da compra ' || purchase.order_number, auth.uid()
        );
    END LOOP;

    UPDATE public.purchase_orders SET status = 'received', received_at = now(), updated_by = auth.uid()
    WHERE id = p_purchase_id;

    IF purchase.total_amount > 0 AND NOT EXISTS (
        SELECT 1 FROM public.financial_transactions WHERE source = 'PURCHASE' AND source_id = p_purchase_id
    ) THEN
        INSERT INTO public.financial_transactions (
            type, status, category, description, amount, payment_method, due_date, source, source_id, notes
        ) VALUES (
            'EXPENSE', 'PENDING', 'Compra de produtos', 'Compra ' || purchase.order_number,
            purchase.total_amount, purchase.payment_method, purchase.expected_date, 'PURCHASE', p_purchase_id,
            'Lançamento criado automaticamente no recebimento da compra.'
        );
    END IF;
    RETURN p_purchase_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_purchase_order(UUID, UUID, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_purchase_order(UUID, UUID, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_order(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(UUID) TO authenticated;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_suppliers ON public.suppliers FOR SELECT USING (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.view')
);
CREATE POLICY insert_suppliers ON public.suppliers FOR INSERT WITH CHECK (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.create')
);
CREATE POLICY update_suppliers ON public.suppliers FOR UPDATE USING (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.update')
) WITH CHECK (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.update')
);
CREATE POLICY delete_suppliers ON public.suppliers FOR DELETE USING (public.is_owner(auth.uid()));

CREATE POLICY select_purchase_orders ON public.purchase_orders FOR SELECT USING (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.view')
);
CREATE POLICY modify_purchase_orders ON public.purchase_orders FOR ALL USING (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.update')
) WITH CHECK (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.create') OR public.has_permission(auth.uid(), 'purchases.update')
);
CREATE POLICY select_purchase_items ON public.purchase_order_items FOR SELECT USING (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.view')
);
CREATE POLICY modify_purchase_items ON public.purchase_order_items FOR ALL USING (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.update')
) WITH CHECK (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.create') OR public.has_permission(auth.uid(), 'purchases.update')
);
CREATE POLICY select_purchase_documents ON public.purchase_documents FOR SELECT USING (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.view')
);
CREATE POLICY modify_purchase_documents ON public.purchase_documents FOR ALL USING (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.update')
) WITH CHECK (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.create') OR public.has_permission(auth.uid(), 'purchases.update')
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'purchase-documents', 'purchase-documents', false, 15728640,
    ARRAY['application/pdf', 'application/xml', 'text/xml', 'image/jpeg', 'image/png', 'image/webp', 'text/plain']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY purchase_documents_storage_select ON storage.objects FOR SELECT USING (
    bucket_id = 'purchase-documents' AND (
        public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.view')
    )
);
CREATE POLICY purchase_documents_storage_insert ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'purchase-documents' AND (
        public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.create') OR public.has_permission(auth.uid(), 'purchases.update')
    )
);
CREATE POLICY purchase_documents_storage_delete ON storage.objects FOR DELETE USING (
    bucket_id = 'purchase-documents' AND (
        public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'purchases.update')
    )
);
