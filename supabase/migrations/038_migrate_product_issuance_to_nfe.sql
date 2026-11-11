-- Migra a emissao de mercadorias da NFC-e (modelo 65) para a NF-e (modelo 55).
-- O historico de documentos modelo 65 permanece intacto para consulta/cancelamento.
-- Regras aprovadas sao versionadas, nunca sobrescritas, preservando a trilha fiscal.

WITH candidates AS (
    SELECT legacy.*,
        ROW_NUMBER() OVER (PARTITION BY legacy.name ORDER BY legacy.created_at, legacy.id) AS version_offset
    FROM public.fiscal_rules legacy
    WHERE legacy.status = 'approved'
      AND legacy.operation_type = 'sale'
      AND legacy.document_model = '65'
      AND NOT EXISTS (
          SELECT 1 FROM public.fiscal_rules nfe
          WHERE nfe.status = 'approved'
            AND nfe.operation_type = legacy.operation_type
            AND nfe.document_model = '55'
            AND nfe.company_crt = legacy.company_crt
            AND nfe.fiscal_profile_id = legacy.fiscal_profile_id
            AND nfe.origin_scope = legacy.origin_scope
            AND nfe.destination_scope = legacy.destination_scope
            AND nfe.destination_uf IS NOT DISTINCT FROM legacy.destination_uf
            AND nfe.taxpayer_indicator = legacy.taxpayer_indicator
            AND nfe.purchase_purpose = legacy.purchase_purpose
            AND nfe.valid_from = legacy.valid_from
            AND nfe.valid_to IS NOT DISTINCT FROM legacy.valid_to
      )
), max_versions AS (
    SELECT name, MAX(version) AS max_version
    FROM public.fiscal_rules
    GROUP BY name
)
INSERT INTO public.fiscal_rules (
    name, version, status, company_crt, fiscal_profile_id, operation_type,
    document_model, origin_scope, destination_scope, destination_uf,
    taxpayer_indicator, purchase_purpose, cfop, csosn, cst_icms,
    tax_parameters, source, valid_from, valid_to, approved_by, approved_at
)
SELECT candidates.name, max_versions.max_version + candidates.version_offset,
    'approved', candidates.company_crt, candidates.fiscal_profile_id,
    candidates.operation_type, '55', candidates.origin_scope,
    candidates.destination_scope, candidates.destination_uf,
    candidates.taxpayer_indicator, candidates.purchase_purpose,
    candidates.cfop, candidates.csosn, candidates.cst_icms,
    candidates.tax_parameters,
    CONCAT_WS(' | ', NULLIF(BTRIM(COALESCE(candidates.source, '')), ''), 'Migracao para NF-e modelo 55'),
    candidates.valid_from, candidates.valid_to, candidates.approved_by, now()
FROM candidates
JOIN max_versions ON max_versions.name = candidates.name;

UPDATE public.fiscal_rules
SET status = 'inactive'
WHERE status = 'approved'
  AND operation_type = 'sale'
  AND document_model = '65';

UPDATE public.fiscal_settings
SET nfe_series = '1'
WHERE NULLIF(BTRIM(COALESCE(nfe_series, '')), '') IS NULL;

UPDATE public.permissions
SET description = 'Visualizar NF-e de mercadorias e demais notas fiscais emitidas.'
WHERE key = 'fiscal.view';

UPDATE public.settings
SET description = 'Ambiente do provedor de emissao fiscal de NF-e (mock, homologation ou production).'
WHERE key = 'fiscal_environment';

COMMENT ON COLUMN public.fiscal_settings.nfce_series IS
'Campo legado mantido apenas para documentos NFC-e historicos; novas vendas usam nfe_series.';

COMMENT ON COLUMN public.fiscal_settings.nfce_next_number IS
'Campo legado mantido apenas para documentos NFC-e historicos; a NF-e e numerada pelo provedor autorizado.';
