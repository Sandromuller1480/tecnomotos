-- Product fiscal workflow and versioned operation rules.
-- This migration is additive: legacy product tax columns remain available only
-- for historical evidence and are never promoted to approved rules.

ALTER TABLE public.products
    ALTER COLUMN stock_quantity TYPE NUMERIC(14, 3) USING stock_quantity::NUMERIC,
    ALTER COLUMN min_stock_quantity TYPE NUMERIC(14, 3) USING min_stock_quantity::NUMERIC,
    ADD COLUMN IF NOT EXISTS without_gtin BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS fiscal_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS fiscal_review_notes TEXT;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_fiscal_status;
ALTER TABLE public.products ADD CONSTRAINT chk_products_fiscal_status
    CHECK (fiscal_status IN ('pending', 'review_required', 'complete'));

CREATE OR REPLACE FUNCTION public.is_valid_gtin(value TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    i INTEGER;
    total INTEGER := 0;
    check_digit INTEGER;
    position_from_right INTEGER := 0;
BEGIN
    IF value IS NULL THEN RETURN TRUE; END IF;
    IF value !~ '^(\d{8}|\d{12}|\d{13}|\d{14})$' THEN RETURN FALSE; END IF;
    check_digit := substring(value FROM char_length(value) FOR 1)::INTEGER;
    FOR i IN REVERSE char_length(value) - 1..1 LOOP
        total := total + substring(value FROM i FOR 1)::INTEGER * CASE WHEN position_from_right % 2 = 0 THEN 3 ELSE 1 END;
        position_from_right := position_from_right + 1;
    END LOOP;
    RETURN ((10 - (total % 10)) % 10) = check_digit;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_ncm_format;
ALTER TABLE public.products ADD CONSTRAINT chk_products_ncm_format CHECK (ncm IS NULL OR ncm ~ '^\d{8}$');
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_cest_format;
ALTER TABLE public.products ADD CONSTRAINT chk_products_cest_format CHECK (cest IS NULL OR cest ~ '^\d{7}$');
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_gtin;
ALTER TABLE public.products ADD CONSTRAINT chk_products_gtin CHECK (
    (without_gtin AND gtin IS NULL) OR (NOT without_gtin AND public.is_valid_gtin(gtin))
);

ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS state_registration TEXT,
    ADD COLUMN IF NOT EXISTS icms_taxpayer_indicator TEXT,
    ADD COLUMN IF NOT EXISTS purchase_purpose TEXT;

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS chk_customers_icms_indicator;
ALTER TABLE public.customers ADD CONSTRAINT chk_customers_icms_indicator
    CHECK (icms_taxpayer_indicator IS NULL OR icms_taxpayer_indicator IN ('contributor', 'exempt', 'non_contributor'));
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS chk_customers_purchase_purpose;
ALTER TABLE public.customers ADD CONSTRAINT chk_customers_purchase_purpose
    CHECK (purchase_purpose IS NULL OR purchase_purpose IN ('resale', 'final_consumption'));

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS delivery_address_id UUID REFERENCES public.customer_addresses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS delivery_mode TEXT,
    ADD COLUMN IF NOT EXISTS purchase_purpose TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_preview_hash TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_previewed_at TIMESTAMPTZ;

ALTER TABLE public.fiscal_tax_profiles
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS valid_from DATE,
    ADD COLUMN IF NOT EXISTS valid_to DATE,
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE public.fiscal_tax_profiles DROP CONSTRAINT IF EXISTS chk_fiscal_profile_status;
ALTER TABLE public.fiscal_tax_profiles ADD CONSTRAINT chk_fiscal_profile_status
    CHECK (status IN ('draft', 'approved', 'inactive'));
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fiscal_profile_code_version
    ON public.fiscal_tax_profiles(code, version) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fiscal_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'inactive')),
    company_crt TEXT NOT NULL,
    fiscal_profile_id UUID NOT NULL REFERENCES public.fiscal_tax_profiles(id) ON DELETE RESTRICT,
    operation_type TEXT NOT NULL DEFAULT 'sale',
    document_model TEXT NOT NULL CHECK (document_model IN ('55', '65')),
    origin_scope TEXT NOT NULL CHECK (origin_scope IN ('internal', 'interstate')),
    destination_scope TEXT NOT NULL CHECK (destination_scope IN ('internal', 'interstate')),
    destination_uf TEXT,
    taxpayer_indicator TEXT NOT NULL CHECK (taxpayer_indicator IN ('contributor', 'exempt', 'non_contributor', 'any')),
    purchase_purpose TEXT NOT NULL CHECK (purchase_purpose IN ('resale', 'final_consumption', 'any')),
    cfop TEXT NOT NULL CHECK (cfop ~ '^[0-9]{4}$'),
    csosn TEXT CHECK (csosn IS NULL OR csosn ~ '^[0-9]{3}$'),
    cst_icms TEXT CHECK (cst_icms IS NULL OR cst_icms ~ '^[0-9]{2}$'),
    tax_parameters JSONB NOT NULL DEFAULT '{}'::JSONB,
    source TEXT,
    valid_from DATE NOT NULL,
    valid_to DATE,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_fiscal_rule_tax_code CHECK ((csosn IS NULL) <> (cst_icms IS NULL)),
    CONSTRAINT chk_fiscal_rule_approval CHECK (
        status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND source IS NOT NULL)
    ),
    CONSTRAINT chk_fiscal_rule_validity CHECK (valid_to IS NULL OR valid_to >= valid_from),
    UNIQUE (name, version)
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('initial', 'adjustment', 'sale', 'return')),
    quantity_delta NUMERIC(14, 3) NOT NULL CHECK (quantity_delta <> 0),
    balance_before NUMERIC(14, 3) NOT NULL,
    balance_after NUMERIC(14, 3) NOT NULL,
    reason TEXT NOT NULL CHECK (char_length(btrim(reason)) >= 5),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_fiscal_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    fiscal_profile_id UUID NOT NULL REFERENCES public.fiscal_tax_profiles(id) ON DELETE RESTRICT,
    source TEXT NOT NULL,
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fiscal_previews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    context_hash TEXT NOT NULL,
    document_model TEXT NOT NULL CHECK (document_model IN ('55', '65')),
    status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'invalidated', 'used')),
    context_snapshot JSONB NOT NULL,
    rules_snapshot JSONB NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    invalidated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.fiscal_document_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fiscal_document_id UUID NOT NULL REFERENCES public.fiscal_documents(id) ON DELETE RESTRICT,
    order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    fiscal_rule_id UUID REFERENCES public.fiscal_rules(id) ON DELETE SET NULL,
    rule_version INTEGER NOT NULL,
    item_number INTEGER NOT NULL,
    product_snapshot JSONB NOT NULL,
    fiscal_snapshot JSONB NOT NULL,
    quantity NUMERIC(14, 3) NOT NULL,
    unit_price NUMERIC(14, 4) NOT NULL,
    total_amount NUMERIC(14, 2) NOT NULL,
    cfop TEXT NOT NULL,
    csosn TEXT,
    cst_icms TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (fiscal_document_id, item_number)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_rules_resolution ON public.fiscal_rules
    (status, fiscal_profile_id, document_model, destination_scope, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_products_fiscal_pending ON public.products(fiscal_status)
    WHERE fiscal_status <> 'complete';
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON public.inventory_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_fiscal_classification ON public.product_fiscal_classifications(product_id, assigned_at DESC);

CREATE OR REPLACE FUNCTION public.set_product_fiscal_status()
RETURNS TRIGGER AS $$
DECLARE
    profile_status TEXT;
BEGIN
    IF NEW.fiscal_tax_profile_id IS NOT NULL THEN
        SELECT status INTO profile_status FROM public.fiscal_tax_profiles WHERE id = NEW.fiscal_tax_profile_id;
    END IF;

    IF NEW.ncm ~ '^[0-9]{8}$'
       AND NEW.fiscal_origin BETWEEN 0 AND 8
       AND NULLIF(BTRIM(NEW.unit), '') IS NOT NULL
       AND (NEW.without_gtin OR NEW.gtin ~ '^[0-9]{8}([0-9]{4}([0-9]{1,2})?)?)?$')
       AND profile_status = 'approved' THEN
        NEW.fiscal_status := 'complete';
    ELSIF NEW.fiscal_tax_profile_id IS NOT NULL THEN
        NEW.fiscal_status := 'review_required';
    ELSE
        NEW.fiscal_status := 'pending';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_product_fiscal_status_trigger ON public.products;
CREATE TRIGGER set_product_fiscal_status_trigger
BEFORE INSERT OR UPDATE OF ncm, cest, fiscal_origin, unit, gtin, without_gtin, fiscal_tax_profile_id
ON public.products FOR EACH ROW EXECUTE PROCEDURE public.set_product_fiscal_status();

CREATE OR REPLACE FUNCTION public.record_initial_product_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF COALESCE(NEW.stock_quantity, 0) <> 0 THEN
        INSERT INTO public.inventory_movements
            (product_id, movement_type, quantity_delta, balance_before, balance_after, reason, created_by)
        VALUES (NEW.id, 'initial', NEW.stock_quantity, 0, NEW.stock_quantity, 'Estoque inicial do cadastro', auth.uid());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS record_initial_product_stock_trigger ON public.products;
CREATE TRIGGER record_initial_product_stock_trigger
AFTER INSERT ON public.products FOR EACH ROW EXECUTE PROCEDURE public.record_initial_product_stock();

CREATE OR REPLACE FUNCTION public.adjust_product_stock(
    p_product_id UUID,
    p_quantity_delta NUMERIC,
    p_reason TEXT
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_before NUMERIC(14, 3);
    v_after NUMERIC(14, 3);
BEGIN
    IF NOT (public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'inventory.update')) THEN
        RAISE EXCEPTION 'Acesso negado para ajuste de estoque.';
    END IF;
    IF p_quantity_delta = 0 OR char_length(btrim(COALESCE(p_reason, ''))) < 5 THEN
        RAISE EXCEPTION 'Informe uma quantidade diferente de zero e um motivo com ao menos 5 caracteres.';
    END IF;

    SELECT stock_quantity INTO v_before FROM public.products WHERE id = p_product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto nao encontrado.'; END IF;
    v_after := v_before + p_quantity_delta;
    IF v_after < 0 THEN RAISE EXCEPTION 'O ajuste deixaria o estoque negativo.'; END IF;

    UPDATE public.products SET stock_quantity = v_after WHERE id = p_product_id;
    INSERT INTO public.inventory_movements
        (product_id, movement_type, quantity_delta, balance_before, balance_after, reason, created_by)
    VALUES (p_product_id, 'adjustment', p_quantity_delta, v_before, v_after, btrim(p_reason), auth.uid());
    RETURN v_after;
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_product_stock(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(UUID, NUMERIC, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_fiscal_profile(
    p_product_ids UUID[],
    p_profile_id UUID,
    p_source TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado para classificar produtos.'; END IF;
    IF COALESCE(array_length(p_product_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'Selecione ao menos um produto.'; END IF;
    IF char_length(btrim(COALESCE(p_source, ''))) < 3 THEN RAISE EXCEPTION 'Informe a fonte da classificação.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fiscal_tax_profiles WHERE id = p_profile_id AND status = 'approved') THEN
        RAISE EXCEPTION 'O perfil fiscal precisa estar aprovado e vigente.';
    END IF;
    PERFORM 1 FROM public.products WHERE id = ANY(p_product_ids) FOR UPDATE;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> array_length(p_product_ids, 1) THEN RAISE EXCEPTION 'Um ou mais produtos não foram encontrados.'; END IF;

    UPDATE public.products SET fiscal_tax_profile_id = p_profile_id WHERE id = ANY(p_product_ids);
    INSERT INTO public.product_fiscal_classifications(product_id, fiscal_profile_id, source, assigned_by)
    SELECT unnest(p_product_ids), p_profile_id, btrim(p_source), auth.uid();
    RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_fiscal_profile(UUID[], UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_fiscal_profile(UUID[], UUID, TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.products_pending_fiscal
WITH (security_invoker = true) AS
SELECT id, sku, name, ncm, cest, fiscal_origin, unit, gtin, without_gtin,
       fiscal_status, fiscal_review_notes, fiscal_tax_profile_id, updated_at
FROM public.products
WHERE fiscal_status <> 'complete';

ALTER TABLE public.fiscal_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_fiscal_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_fiscal_rules ON public.fiscal_rules FOR SELECT USING (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'fiscal.view')
);
CREATE POLICY modify_fiscal_rules ON public.fiscal_rules FOR ALL USING (public.is_owner(auth.uid())) WITH CHECK (public.is_owner(auth.uid()));
CREATE POLICY select_inventory_movements ON public.inventory_movements FOR SELECT USING (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'inventory.view')
);
CREATE POLICY select_fiscal_previews ON public.fiscal_previews FOR SELECT USING (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'fiscal.view')
);
CREATE POLICY modify_fiscal_previews ON public.fiscal_previews FOR ALL USING (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'fiscal.create')
) WITH CHECK (public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'fiscal.create'));
CREATE POLICY select_fiscal_document_items ON public.fiscal_document_items FOR SELECT USING (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'fiscal.view')
);
CREATE POLICY modify_fiscal_document_items ON public.fiscal_document_items FOR ALL USING (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'fiscal.create')
) WITH CHECK (public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'fiscal.create'));
CREATE POLICY select_product_fiscal_classifications ON public.product_fiscal_classifications FOR SELECT USING (
    public.is_owner(auth.uid()) OR public.has_permission(auth.uid(), 'fiscal.view')
);

CREATE TRIGGER update_fiscal_rules_modtime BEFORE UPDATE ON public.fiscal_rules
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- Accounting directions from the supplied PRD are references only. They are
-- deliberately drafts, without approved_by/approved_at, and cannot be resolved.
INSERT INTO public.fiscal_tax_profiles (name, code, version, status, document_type, notes, source)
VALUES
    ('Revenda sem ST - a validar', 'RESALE_NO_ST', 1, 'draft', 'NFE', 'Perfil de referencia; exige classificacao SKU e aprovacao contabil.', 'PRD TECNOMOTOS v1.0'),
    ('ICMS anteriormente retido por ST - a validar', 'RESALE_ST_WITHHELD', 1, 'draft', 'NFE', 'Perfil de referencia; nao conclui ST apenas por CEST.', 'PRD TECNOMOTOS v1.0')
ON CONFLICT (name) DO NOTHING;
