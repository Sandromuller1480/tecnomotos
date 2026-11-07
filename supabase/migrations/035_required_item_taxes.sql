-- Impede a aprovação de regras que não conseguem formar o grupo <imposto>
-- exigido pela NF-e/NFC-e. Os valores devem continuar vindo da orientação
-- contábil; esta migration valida apenas presença e formato.

CREATE OR REPLACE FUNCTION public.approve_fiscal_rule(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rule public.fiscal_rules%ROWTYPE;
    v_pis_cst TEXT;
    v_cofins_cst TEXT;
    v_ipi_cst TEXT;
    v_ipi_legal_code TEXT;
    v_ibs_cbs_cst TEXT;
    v_ibs_cbs_class TEXT;
BEGIN
    IF NOT public.is_owner(auth.uid()) THEN
        RAISE EXCEPTION 'Acesso negado para aprovar regras fiscais.';
    END IF;

    SELECT * INTO v_rule
    FROM public.fiscal_rules
    WHERE id = p_id AND status = 'draft'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Regra fiscal em rascunho não encontrada.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.fiscal_tax_profiles p
        WHERE p.id = v_rule.fiscal_profile_id
          AND p.status = 'approved'
          AND p.valid_from <= CURRENT_DATE
          AND (p.valid_to IS NULL OR p.valid_to >= CURRENT_DATE)
    ) THEN
        RAISE EXCEPTION 'O perfil fiscal da regra não está aprovado e vigente.';
    END IF;

    IF v_rule.csosn IS NOT NULL AND v_rule.csosn !~ '^[0-9]{3}$' THEN
        RAISE EXCEPTION 'CSOSN deve conter 3 dígitos.';
    END IF;
    IF v_rule.cst_icms IS NOT NULL AND v_rule.cst_icms !~ '^[0-9]{2}$' THEN
        RAISE EXCEPTION 'CST ICMS deve conter 2 dígitos.';
    END IF;

    IF jsonb_typeof(COALESCE(v_rule.tax_parameters, '{}'::JSONB)) <> 'object' THEN
        RAISE EXCEPTION 'Os parâmetros tributários da regra devem ser um objeto JSON.';
    END IF;

    v_pis_cst := BTRIM(COALESCE(v_rule.tax_parameters->>'pis_situacao_tributaria', ''));
    v_cofins_cst := BTRIM(COALESCE(v_rule.tax_parameters->>'cofins_situacao_tributaria', ''));
    v_ipi_cst := BTRIM(COALESCE(v_rule.tax_parameters->>'ipi_situacao_tributaria', ''));
    v_ipi_legal_code := BTRIM(COALESCE(v_rule.tax_parameters->>'ipi_codigo_enquadramento_legal', ''));
    v_ibs_cbs_cst := BTRIM(COALESCE(v_rule.tax_parameters->>'ibs_cbs_situacao_tributaria', ''));
    v_ibs_cbs_class := BTRIM(COALESCE(v_rule.tax_parameters->>'ibs_cbs_classificacao_tributaria', ''));

    IF v_pis_cst !~ '^[0-9]{2}$' THEN
        RAISE EXCEPTION 'Informe o CST do PIS com 2 dígitos antes de aprovar a regra.';
    END IF;
    IF v_cofins_cst !~ '^[0-9]{2}$' THEN
        RAISE EXCEPTION 'Informe o CST da COFINS com 2 dígitos antes de aprovar a regra.';
    END IF;
    IF v_ipi_cst <> '' AND v_ipi_cst !~ '^[0-9]{2}$' THEN
        RAISE EXCEPTION 'CST do IPI deve conter 2 dígitos.';
    END IF;
    IF v_ipi_cst <> '' AND v_ipi_legal_code !~ '^[0-9]{3}$' THEN
        RAISE EXCEPTION 'Informe o enquadramento legal do IPI com 3 dígitos.';
    END IF;
    IF (v_ibs_cbs_cst = '') <> (v_ibs_cbs_class = '') THEN
        RAISE EXCEPTION 'CST e classificação tributária do IBS/CBS devem ser informados em conjunto.';
    END IF;
    IF v_ibs_cbs_cst <> '' AND (v_ibs_cbs_cst !~ '^[0-9]{3}$' OR v_ibs_cbs_class !~ '^[0-9]{6}$') THEN
        RAISE EXCEPTION 'CST IBS/CBS deve conter 3 dígitos e a classificação tributária 6 dígitos.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.fiscal_rules r
        WHERE r.id <> v_rule.id
          AND r.status = 'approved'
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

    UPDATE public.fiscal_rules
    SET status = 'approved', approved_by = auth.uid(), approved_at = now()
    WHERE id = p_id
    RETURNING * INTO v_rule;

    RETURN v_rule.id;
END;
$$;

COMMENT ON FUNCTION public.approve_fiscal_rule(UUID) IS
'Aprova regra fiscal somente quando ICMS, PIS, COFINS e parâmetros condicionais estão completos.';

