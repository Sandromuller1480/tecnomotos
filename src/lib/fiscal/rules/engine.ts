export type FiscalDocumentModel = '55' | '65';
export type DestinationScope = 'internal' | 'interstate';
export type TaxpayerIndicator = 'contributor' | 'exempt' | 'non_contributor';
export type PurchasePurpose = 'resale' | 'final_consumption';

export interface FiscalResolutionContext {
  companyCrt: string;
  issuerUf: string;
  destinationUf: string;
  destinationScope: DestinationScope;
  taxpayerIndicator: TaxpayerIndicator;
  purchasePurpose: PurchasePurpose;
  operationType: 'sale' | 'purchase';
  documentModel: FiscalDocumentModel;
  occurredAt: Date;
}

export interface FiscalProductInput {
  id: string;
  sku?: string | null;
  name: string;
  fiscalStatus: 'pending' | 'review_required' | 'complete';
  fiscalProfileId?: string | null;
  ncm?: string | null;
  cest?: string | null;
  origin?: number | null;
  unit?: string | null;
  gtin?: string | null;
  withoutGtin?: boolean;
}

export interface FiscalRuleRecord {
  id: string;
  name: string;
  version: number;
  status: 'draft' | 'approved' | 'inactive';
  companyCrt: string;
  fiscalProfileId: string;
  operationType: 'sale' | 'purchase';
  documentModel: FiscalDocumentModel;
  originScope: DestinationScope;
  destinationScope: DestinationScope;
  destinationUf?: string | null;
  taxpayerIndicator: TaxpayerIndicator | 'any';
  purchasePurpose: PurchasePurpose | 'any';
  cfop: string;
  csosn?: string | null;
  cstIcms?: string | null;
  taxParameters?: Record<string, unknown>;
  validFrom: string;
  validTo?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  source?: string | null;
}

export interface ResolvedFiscalItem {
  productId: string;
  ruleId: string;
  ruleVersion: number;
  cfop: string;
  csosn?: string;
  cstIcms?: string;
  ncm: string;
  cest?: string;
  origin: number;
  unit: string;
  gtin?: string;
  taxParameters: Record<string, unknown>;
}

export class FiscalResolutionError extends Error {
  constructor(
    readonly code: 'PRODUCT_PENDING' | 'INCOMPLETE_PRODUCT' | 'NO_RULE' | 'CONFLICTING_RULES' | 'INVALID_CONTEXT',
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'FiscalResolutionError';
  }
}

export function resolveFiscalItem(
  context: FiscalResolutionContext,
  product: FiscalProductInput,
  rules: FiscalRuleRecord[]
): ResolvedFiscalItem {
  const label = product.sku ? `${product.name} (${product.sku})` : product.name;

  if (!context.taxpayerIndicator) {
    throw new FiscalResolutionError('INVALID_CONTEXT', 'Confirme a situação de contribuinte do ICMS do cliente.');
  }
  const missing: string[] = [];
  if (!/^\d{8}$/.test(product.ncm || '')) missing.push('NCM');
  if (product.origin === null || product.origin === undefined || product.origin < 0 || product.origin > 8) missing.push('origem');
  if (!product.unit?.trim()) missing.push('unidade comercial');
  if (!product.withoutGtin && !product.gtin) missing.push('GTIN ou indicação sem GTIN');
  if (!product.fiscalProfileId) missing.push('perfil fiscal aprovado');

  if (product.fiscalStatus !== 'complete' || !product.fiscalProfileId) {
    throw new FiscalResolutionError(
      'PRODUCT_PENDING',
      `Não foi possível preparar a nota: o produto ${label} ainda não tem perfil fiscal aprovado.`,
      { productId: product.id, missing }
    );
  }

  if (missing.length) {
    throw new FiscalResolutionError(
      'INCOMPLETE_PRODUCT',
      `Não foi possível preparar a nota: complete ${missing.join(', ')} do produto ${label}.`,
      { productId: product.id, missing }
    );
  }

  const day = context.occurredAt.toISOString().slice(0, 10);
  const matches = rules.filter((rule) =>
    rule.status === 'approved'
    && Boolean(rule.approvedBy && rule.approvedAt && rule.source)
    && rule.companyCrt === context.companyCrt
    && rule.fiscalProfileId === product.fiscalProfileId
    && rule.operationType === context.operationType
    && rule.documentModel === context.documentModel
    && rule.originScope === context.destinationScope
    && rule.destinationScope === context.destinationScope
    && (!rule.destinationUf || rule.destinationUf === context.destinationUf)
    && (rule.taxpayerIndicator === 'any' || rule.taxpayerIndicator === context.taxpayerIndicator)
    && (rule.purchasePurpose === 'any' || rule.purchasePurpose === context.purchasePurpose)
    && rule.validFrom <= day
    && (!rule.validTo || rule.validTo >= day)
  );

  if (matches.length === 0) {
    throw new FiscalResolutionError(
      'NO_RULE',
      `Falta uma regra fiscal aprovada para esta venda ao estado ${context.destinationUf}.`,
      { productId: product.id, fiscalProfileId: product.fiscalProfileId, documentModel: context.documentModel }
    );
  }
  if (matches.length > 1) {
    throw new FiscalResolutionError(
      'CONFLICTING_RULES',
      `Existem ${matches.length} regras fiscais aprovadas conflitantes para o produto ${label}.`,
      { productId: product.id, ruleIds: matches.map((rule) => rule.id) }
    );
  }

  const rule = matches[0];
  return {
    productId: product.id,
    ruleId: rule.id,
    ruleVersion: rule.version,
    cfop: rule.cfop,
    csosn: rule.csosn || undefined,
    cstIcms: rule.cstIcms || undefined,
    ncm: product.ncm!,
    cest: product.cest || undefined,
    origin: product.origin!,
    unit: product.unit!,
    gtin: product.withoutGtin ? undefined : product.gtin || undefined,
    taxParameters: rule.taxParameters || {}
  };
}

export function determineDocumentModel(context: Pick<FiscalResolutionContext, 'destinationScope'> & { nfceEligible: boolean }): FiscalDocumentModel {
  if (context.destinationScope === 'interstate') return '55';
  return context.nfceEligible ? '65' : '55';
}
