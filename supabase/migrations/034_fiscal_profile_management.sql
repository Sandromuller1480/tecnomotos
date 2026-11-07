-- Owner-managed fiscal profiles, operation rules and product classifications.
-- Approved records are immutable; corrections must be published as a new version.

ALTER TABLE public.fiscal_tax_profiles
    DROP CONSTRAINT IF EXISTS fiscal_tax_profiles_name_key;

ALTER TABLE public.fiscal_tax_profiles
    DROP CONSTRAINT IF EXISTS chk_fiscal_profile_approval;
ALTER TABLE public.fiscal_tax_profiles
    ADD CONSTRAINT chk_fiscal_profile_approval CHECK (
        status <> 'approved'
        OR (
            approved_by IS NOT NULL
            AND approved_at IS NOT NULL
            AND NULLIF(BTRIM(source), '') IS NOT NULL
            AND NULLIF(BTRIM(code), '') IS NOT NULL
            AND valid_from IS NOT NULL
        )
    );

ALTER TABLE public.fiscal_tax_profiles
    DROP CONSTRAINT IF EXISTS chk_fiscal_profile_validity;
ALTER TABLE public.fiscal_tax_profiles
    ADD CONSTRAINT chk_fiscal_profile_validity CHECK (
        valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from
    );

CREATE OR REPLACE FUNCTION public.guard_approved_fiscal_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF OLD.status = 'approved' THEN
        IF NEW.status <> 'inactive'
           OR NEW.name IS DISTINCT FROM OLD.name
           OR NEW.code IS DISTINCT FROM OLD.code
           OR NEW.version IS DISTINCT FROM OLD.version
           OR NEW.document_type IS DISTINCT FROM OLD.document_type
           OR NEW.notes IS DISTINCT FROM OLD.notes
           OR NEW.source IS DISTINCT FROM OLD.source
           OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
           OR NEW.valid_to IS DISTINCT FROM OLD.valid_to
           OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
           OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
            RAISE EXCEPTION 'Perfis fiscais aprovados são imutáveis. Crie uma nova versão.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_approved_fiscal_profile_trigger ON public.fiscal_tax_profiles;
CREATE TRIGGER guard_approved_fiscal_profile_trigger
BEFORE UPDATE ON public.fiscal_tax_profiles
FOR EACH ROW EXECUTE PROCEDURE public.guard_approved_fiscal_profile();

CREATE OR REPLACE FUNCTION public.guard_approved_fiscal_rule()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF OLD.status = 'approved' THEN
        IF NEW.status <> 'inactive'
           OR NEW.name IS DISTINCT FROM OLD.name
           OR NEW.version IS DISTINCT FROM OLD.version
           OR NEW.company_crt IS DISTINCT FROM OLD.company_crt
           OR NEW.fiscal_profile_id IS DISTINCT FROM OLD.fiscal_profile_id
           OR NEW.operation_type IS DISTINCT FROM OLD.operation_type
           OR NEW.document_model IS DISTINCT FROM OLD.document_model
           OR NEW.origin_scope IS DISTINCT FROM OLD.origin_scope
           OR NEW.destination_scope IS DISTINCT FROM OLD.destination_scope
           OR NEW.destination_uf IS DISTINCT FROM OLD.destination_uf
           OR NEW.taxpayer_indicator IS DISTINCT FROM OLD.taxpayer_indicator
           OR NEW.purchase_purpose IS DISTINCT FROM OLD.purchase_purpose
           OR NEW.cfop IS DISTINCT FROM OLD.cfop
           OR NEW.csosn IS DISTINCT FROM OLD.csosn
           OR NEW.cst_icms IS DISTINCT FROM OLD.cst_icms
           OR NEW.tax_parameters IS DISTINCT FROM OLD.tax_parameters
           OR NEW.source IS DISTINCT FROM OLD.source
           OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
           OR NEW.valid_to IS DISTINCT FROM OLD.valid_to
           OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
           OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
            RAISE EXCEPTION 'Regras fiscais aprovadas são imutáveis. Crie uma nova versão.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_approved_fiscal_rule_trigger ON public.fiscal_rules;
CREATE TRIGGER guard_approved_fiscal_rule_trigger
BEFORE UPDATE ON public.fiscal_rules
FOR EACH ROW EXECUTE PROCEDURE public.guard_approved_fiscal_rule();

DROP POLICY IF EXISTS modify_fiscal_tax_profiles ON public.fiscal_tax_profiles;
DROP POLICY IF EXISTS modify_fiscal_rules ON public.fiscal_rules;

CREATE OR REPLACE FUNCTION public.save_fiscal_profile_draft(
    p_id UUID,
    p_name TEXT,
    p_code TEXT,
    p_source TEXT,
    p_valid_from DATE,
    p_valid_to DATE,
    p_notes TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_code TEXT := UPPER(BTRIM(COALESCE(p_code, '')));
    v_version INTEGER;
BEGIN
    IF NOT public.is_owner(auth.uid()) THEN
        RAISE EXCEPTION 'Acesso negado para gerenciar perfis fiscais.';
    END IF;
    IF char_length(BTRIM(COALESCE(p_name, ''))) < 3 THEN
        RAISE EXCEPTION 'Informe um nome com ao menos 3 caracteres.';
    END IF;
    IF v_code !~ '^[A-Z0-9_]{3,40}$' THEN
        RAISE EXCEPTION 'O código deve ter de 3 a 40 caracteres, usando letras, números ou sublinhado.';
    END IF;
    IF char_length(BTRIM(COALESCE(p_source, ''))) < 3 THEN
        RAISE EXCEPTION 'Informe a fonte contábil da classificação.';
    END IF;
    IF p_valid_from IS NULL OR (p_valid_to IS NOT NULL AND p_valid_to < p_valid_from) THEN
        RAISE EXCEPTION 'Informe uma vigência válida.';
    END IF;

    IF p_id IS NULL THEN
        SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
        FROM public.fiscal_tax_profiles WHERE code = v_code;

        INSERT INTO public.fiscal_tax_profiles (
            name, code, version, status, document_type, notes, source, valid_from, valid_to,
            is_active, approved_by, approved_at
        ) VALUES (
            BTRIM(p_name), v_code, v_version, 'draft', 'NFE', NULLIF(BTRIM(p_notes), ''),
            BTRIM(p_source), p_valid_from, p_valid_to, true, NULL, NULL
        ) RETURNING id INTO v_id;
    ELSE
        UPDATE public.fiscal_tax_profiles
        SET name = BTRIM(p_name), code = v_code, notes = NULLIF(BTRIM(p_notes), ''),
            source = BTRIM(p_source), valid_from = p_valid_from, valid_to = p_valid_to,
            document_type = 'NFE', is_active = true
        WHERE id = p_id AND status = 'draft'
        RETURNING id INTO v_id;
        IF v_id IS NULL THEN
            RAISE EXCEPTION 'Perfil em rascunho não encontrado. Perfis aprovados exigem nova versão.';
        END IF;
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_fiscal_profile(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF NOT public.is_owner(auth.uid()) THEN
        RAISE EXCEPTION 'Acesso negado para aprovar perfis fiscais.';
    END IF;

    UPDATE public.fiscal_tax_profiles
    SET status = 'approved', approved_by = auth.uid(), approved_at = now(), is_active = true
    WHERE id = p_id
      AND status = 'draft'
      AND NULLIF(BTRIM(code), '') IS NOT NULL
      AND NULLIF(BTRIM(source), '') IS NOT NULL
      AND valid_from IS NOT NULL
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
        RAISE EXCEPTION 'Perfil não encontrado ou incompleto para aprovação.';
    END IF;

    UPDATE public.products
    SET fiscal_tax_profile_id = fiscal_tax_profile_id
    WHERE fiscal_tax_profile_id = p_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_fiscal_profile(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF NOT public.is_owner(auth.uid()) THEN
        RAISE EXCEPTION 'Acesso negado para inativar perfis fiscais.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.fiscal_rules WHERE fiscal_profile_id = p_id AND status = 'approved') THEN
        RAISE EXCEPTION 'Inative primeiro as regras aprovadas vinculadas a este perfil.';
    END IF;
    UPDATE public.fiscal_tax_profiles
    SET status = 'inactive', is_active = false
    WHERE id = p_id AND status IN ('draft', 'approved')
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Perfil fiscal ativo não encontrado.'; END IF;
    UPDATE public.products SET fiscal_tax_profile_id = fiscal_tax_profile_id WHERE fiscal_tax_profile_id = p_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_fiscal_rule_draft(
    p_id UUID,
    p_name TEXT,
    p_company_crt TEXT,
    p_fiscal_profile_id UUID,
    p_document_model TEXT,
    p_origin_scope TEXT,
    p_destination_scope TEXT,
    p_destination_uf TEXT,
    p_taxpayer_indicator TEXT,
    p_purchase_purpose TEXT,
    p_cfop TEXT,
    p_csosn TEXT,
    p_cst_icms TEXT,
    p_tax_parameters JSONB,
    p_source TEXT,
    p_valid_from DATE,
    p_valid_to DATE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_version INTEGER;
    v_uf TEXT := NULLIF(UPPER(BTRIM(COALESCE(p_destination_uf, ''))), '');
BEGIN
    IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado para gerenciar regras fiscais.'; END IF;
    IF char_length(BTRIM(COALESCE(p_name, ''))) < 3 THEN RAISE EXCEPTION 'Informe o nome da regra.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fiscal_tax_profiles WHERE id = p_fiscal_profile_id AND status = 'approved') THEN
        RAISE EXCEPTION 'Selecione um perfil fiscal aprovado.';
    END IF;
    IF p_document_model NOT IN ('55', '65')
       OR p_origin_scope NOT IN ('internal', 'interstate')
       OR p_destination_scope NOT IN ('internal', 'interstate')
       OR p_taxpayer_indicator NOT IN ('contributor', 'exempt', 'non_contributor', 'any')
       OR p_purchase_purpose NOT IN ('resale', 'final_consumption', 'any') THEN
        RAISE EXCEPTION 'Contexto fiscal inválido.';
    END IF;
    IF v_uf IS NOT NULL AND v_uf !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'UF de destino inválida.'; END IF;
    IF COALESCE(p_cfop, '') !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'CFOP deve conter 4 dígitos.'; END IF;
    IF (NULLIF(BTRIM(COALESCE(p_csosn, '')), '') IS NULL) = (NULLIF(BTRIM(COALESCE(p_cst_icms, '')), '') IS NULL) THEN
        RAISE EXCEPTION 'Informe somente um código: CSOSN ou CST ICMS.';
    END IF;
    IF char_length(BTRIM(COALESCE(p_source, ''))) < 3 THEN RAISE EXCEPTION 'Informe a fonte contábil da regra.'; END IF;
    IF p_valid_from IS NULL OR (p_valid_to IS NOT NULL AND p_valid_to < p_valid_from) THEN RAISE EXCEPTION 'Informe uma vigência válida.'; END IF;

    IF p_id IS NULL THEN
        SELECT COALESCE(MAX(version), 0) + 1 INTO v_version FROM public.fiscal_rules WHERE name = BTRIM(p_name);
        INSERT INTO public.fiscal_rules (
            name, version, status, company_crt, fiscal_profile_id, operation_type,
            document_model, origin_scope, destination_scope, destination_uf,
            taxpayer_indicator, purchase_purpose, cfop, csosn, cst_icms,
            tax_parameters, source, valid_from, valid_to, approved_by, approved_at
        ) VALUES (
            BTRIM(p_name), v_version, 'draft', BTRIM(p_company_crt), p_fiscal_profile_id, 'sale',
            p_document_model, p_origin_scope, p_destination_scope, v_uf,
            p_taxpayer_indicator, p_purchase_purpose, p_cfop,
            NULLIF(BTRIM(COALESCE(p_csosn, '')), ''), NULLIF(BTRIM(COALESCE(p_cst_icms, '')), ''),
            COALESCE(p_tax_parameters, '{}'::JSONB), BTRIM(p_source), p_valid_from, p_valid_to, NULL, NULL
        ) RETURNING id INTO v_id;
    ELSE
        UPDATE public.fiscal_rules SET
            name = BTRIM(p_name), company_crt = BTRIM(p_company_crt), fiscal_profile_id = p_fiscal_profile_id,
            document_model = p_document_model, origin_scope = p_origin_scope, destination_scope = p_destination_scope,
            destination_uf = v_uf, taxpayer_indicator = p_taxpayer_indicator, purchase_purpose = p_purchase_purpose,
            cfop = p_cfop, csosn = NULLIF(BTRIM(COALESCE(p_csosn, '')), ''),
            cst_icms = NULLIF(BTRIM(COALESCE(p_cst_icms, '')), ''), tax_parameters = COALESCE(p_tax_parameters, '{}'::JSONB),
            source = BTRIM(p_source), valid_from = p_valid_from, valid_to = p_valid_to
        WHERE id = p_id AND status = 'draft'
        RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Regra em rascunho não encontrada. Regras aprovadas exigem nova versão.'; END IF;
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_fiscal_rule(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rule public.fiscal_rules%ROWTYPE;
BEGIN
    IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado para aprovar regras fiscais.'; END IF;
    SELECT * INTO v_rule FROM public.fiscal_rules WHERE id = p_id AND status = 'draft' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Regra fiscal em rascunho não encontrada.'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.fiscal_tax_profiles p
        WHERE p.id = v_rule.fiscal_profile_id AND p.status = 'approved'
          AND p.valid_from <= CURRENT_DATE AND (p.valid_to IS NULL OR p.valid_to >= CURRENT_DATE)
    ) THEN RAISE EXCEPTION 'O perfil fiscal da regra não está aprovado e vigente.'; END IF;

    IF EXISTS (
        SELECT 1 FROM public.fiscal_rules r
        WHERE r.id <> v_rule.id AND r.status = 'approved'
          AND r.company_crt = v_rule.company_crt
          AND r.fiscal_profile_id = v_rule.fiscal_profile_id
          AND r.operation_type = v_rule.operation_type
          AND r.document_model = v_rule.document_model
          AND r.origin_scope = v_rule.origin_scope
          AND r.destination_scope = v_rule.destination_scope
          AND (r.destination_uf IS NULL OR v_rule.destination_uf IS NULL OR r.destination_uf = v_rule.destination_uf)
          AND (r.taxpayer_indicator = 'any' OR v_rule.taxpayer_indicator = 'any' OR r.taxpayer_indicator = v_rule.taxpayer_indicator)
          AND (r.purchase_purpose = 'any' OR v_rule.purchase_purpose = 'any' OR r.purchase_purpose = v_rule.purchase_purpose)
          AND r.valid_from <= COALESCE(v_rule.valid_to, 'infinity'::DATE)
          AND v_rule.valid_from <= COALESCE(r.valid_to, 'infinity'::DATE)
    ) THEN
        RAISE EXCEPTION 'Existe uma regra aprovada conflitante para o mesmo cenário e vigência.';
    END IF;

    UPDATE public.fiscal_rules SET status = 'approved', approved_by = auth.uid(), approved_at = now()
    WHERE id = p_id RETURNING * INTO v_rule;
    RETURN v_rule.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_fiscal_rule(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado para inativar regras fiscais.'; END IF;
    UPDATE public.fiscal_rules SET status = 'inactive'
    WHERE id = p_id AND status IN ('draft', 'approved') RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Regra fiscal ativa não encontrada.'; END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.classify_product_fiscal(
    p_product_id UUID,
    p_profile_id UUID,
    p_ncm TEXT,
    p_cest TEXT,
    p_fiscal_origin INTEGER,
    p_unit TEXT,
    p_gtin TEXT,
    p_without_gtin BOOLEAN,
    p_source TEXT,
    p_review_notes TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
BEGIN
    IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado para classificar produtos.'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.fiscal_tax_profiles
        WHERE id = p_profile_id AND status = 'approved'
          AND valid_from <= CURRENT_DATE AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
    ) THEN RAISE EXCEPTION 'O perfil fiscal precisa estar aprovado e vigente.'; END IF;
    IF COALESCE(p_ncm, '') !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'NCM deve conter 8 dígitos.'; END IF;
    IF NULLIF(BTRIM(COALESCE(p_cest, '')), '') IS NOT NULL AND p_cest !~ '^[0-9]{7}$' THEN RAISE EXCEPTION 'CEST deve conter 7 dígitos.'; END IF;
    IF p_fiscal_origin NOT BETWEEN 0 AND 8 THEN RAISE EXCEPTION 'Origem da mercadoria inválida.'; END IF;
    IF NULLIF(BTRIM(COALESCE(p_unit, '')), '') IS NULL THEN RAISE EXCEPTION 'Informe a unidade comercial.'; END IF;
    IF char_length(BTRIM(COALESCE(p_source, ''))) < 3 THEN RAISE EXCEPTION 'Informe a fonte da classificação.'; END IF;
    IF NOT p_without_gtin AND (
        NULLIF(BTRIM(COALESCE(p_gtin, '')), '') IS NULL
        OR NOT public.is_valid_gtin(NULLIF(BTRIM(COALESCE(p_gtin, '')), ''))
    ) THEN
        RAISE EXCEPTION 'Informe um GTIN válido ou marque o produto como sem GTIN.';
    END IF;

    UPDATE public.products SET
        ncm = p_ncm, cest = NULLIF(BTRIM(COALESCE(p_cest, '')), ''),
        origin = p_fiscal_origin, fiscal_origin = p_fiscal_origin,
        unit = UPPER(BTRIM(p_unit)), taxable_unit = UPPER(BTRIM(p_unit)),
        gtin = CASE WHEN p_without_gtin THEN NULL ELSE BTRIM(p_gtin) END,
        without_gtin = p_without_gtin, fiscal_tax_profile_id = p_profile_id,
        fiscal_review_notes = NULLIF(BTRIM(COALESCE(p_review_notes, '')), '')
    WHERE id = p_product_id
    RETURNING fiscal_status INTO v_status;
    IF v_status IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.'; END IF;

    INSERT INTO public.product_fiscal_classifications(product_id, fiscal_profile_id, source, assigned_by)
    VALUES (p_product_id, p_profile_id, BTRIM(p_source), auth.uid());
    RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.save_fiscal_profile_draft(UUID, TEXT, TEXT, TEXT, DATE, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_fiscal_profile(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_fiscal_profile(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_fiscal_rule_draft(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_fiscal_rule(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_fiscal_rule(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classify_product_fiscal(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_fiscal_profile_draft(UUID, TEXT, TEXT, TEXT, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_fiscal_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_fiscal_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_fiscal_rule_draft(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_fiscal_rule(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_fiscal_rule(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classify_product_fiscal(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
