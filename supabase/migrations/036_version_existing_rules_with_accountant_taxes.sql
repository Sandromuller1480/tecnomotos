-- Cria novas versões das regras aprovadas que ainda não possuem os tributos
-- mínimos do item. A classificação de ICMS/CFOP existente é preservada.
-- Valores complementares conforme o escopo fiscal TECNOMOTOS de 21/10/2026:
-- PIS 08, COFINS 08 e IPI 53. O enquadramento 999 é o código técnico indicado
-- pela Focus quando não há enquadramento legal específico de IPI.

DO $$
DECLARE
    v_rule public.fiscal_rules%ROWTYPE;
    v_next_version INTEGER;
    v_tax_parameters JSONB;
BEGIN
    FOR v_rule IN
        SELECT r.*
        FROM public.fiscal_rules r
        WHERE r.status = 'approved'
          AND r.operation_type = 'sale'
          AND (
              NULLIF(BTRIM(COALESCE(r.tax_parameters->>'pis_situacao_tributaria', '')), '') IS NULL
              OR NULLIF(BTRIM(COALESCE(r.tax_parameters->>'cofins_situacao_tributaria', '')), '') IS NULL
              OR NULLIF(BTRIM(COALESCE(r.tax_parameters->>'ipi_situacao_tributaria', '')), '') IS NULL
              OR NULLIF(BTRIM(COALESCE(r.tax_parameters->>'ipi_codigo_enquadramento_legal', '')), '') IS NULL
          )
        ORDER BY r.created_at, r.id
        FOR UPDATE
    LOOP
        SELECT COALESCE(MAX(r.version), 0) + 1
        INTO v_next_version
        FROM public.fiscal_rules r
        WHERE r.name = v_rule.name;

        v_tax_parameters := COALESCE(v_rule.tax_parameters, '{}'::JSONB) || jsonb_build_object(
            'pis_situacao_tributaria', COALESCE(
                NULLIF(BTRIM(COALESCE(v_rule.tax_parameters->>'pis_situacao_tributaria', '')), ''),
                '08'
            ),
            'cofins_situacao_tributaria', COALESCE(
                NULLIF(BTRIM(COALESCE(v_rule.tax_parameters->>'cofins_situacao_tributaria', '')), ''),
                '08'
            ),
            'ipi_situacao_tributaria', COALESCE(
                NULLIF(BTRIM(COALESCE(v_rule.tax_parameters->>'ipi_situacao_tributaria', '')), ''),
                '53'
            ),
            'ipi_codigo_enquadramento_legal', COALESCE(
                NULLIF(BTRIM(COALESCE(v_rule.tax_parameters->>'ipi_codigo_enquadramento_legal', '')), ''),
                '999'
            )
        );

        -- O gatilho de imutabilidade permite somente a inativação da versão
        -- aprovada; os dados tributários permanecem intactos no histórico.
        UPDATE public.fiscal_rules
        SET status = 'inactive'
        WHERE id = v_rule.id;

        INSERT INTO public.fiscal_rules (
            name,
            version,
            status,
            company_crt,
            fiscal_profile_id,
            operation_type,
            document_model,
            origin_scope,
            destination_scope,
            destination_uf,
            taxpayer_indicator,
            purchase_purpose,
            cfop,
            csosn,
            cst_icms,
            tax_parameters,
            source,
            valid_from,
            valid_to,
            approved_by,
            approved_at
        ) VALUES (
            v_rule.name,
            v_next_version,
            'approved',
            v_rule.company_crt,
            v_rule.fiscal_profile_id,
            v_rule.operation_type,
            v_rule.document_model,
            v_rule.origin_scope,
            v_rule.destination_scope,
            v_rule.destination_uf,
            v_rule.taxpayer_indicator,
            v_rule.purchase_purpose,
            v_rule.cfop,
            v_rule.csosn,
            v_rule.cst_icms,
            v_tax_parameters,
            CONCAT_WS(' | ', NULLIF(BTRIM(COALESCE(v_rule.source, '')), ''), 'Complemento do escopo fiscal TECNOMOTOS de 21/10/2026'),
            v_rule.valid_from,
            v_rule.valid_to,
            v_rule.approved_by,
            now()
        );
    END LOOP;
END;
$$;

