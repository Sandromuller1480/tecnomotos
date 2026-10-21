export type FiscalProviderName = 'mock' | 'focusnfe';
export type FiscalEnvironment = 'mock' | 'homologation' | 'production';
export type FiscalDocumentStatus = 'pending' | 'processing' | 'authorized' | 'rejected' | 'cancelled' | 'contingency' | 'error';

export interface FiscalCompanySettings {
  companyName: string;
  cnpj: string;
  stateRegistration?: string | null;
  uf: string;
  city?: string | null;
  ibgeCityCode?: string | null;
  crt?: string | null;
  nfceSeries?: string | null;
}

export interface FiscalSaleItem {
  id: string;
  productId?: string;
  name: string;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
  ncm?: string | null;
  cest?: string | null;
  cfop?: string | null;
  cst?: string | null;
  csosn?: string | null;
  origin?: number | null;
  unit?: string | null;
  gtin?: string | null;
}

export interface FiscalSale {
  id: string;
  customerName?: string | null;
  customerDocument?: string | null;
  customerEmail?: string | null;
  totalAmount: number;
  paymentMethod: string;
  items: FiscalSaleItem[];
}

export interface NfceIssueInput {
  operationId: string;
  reference: string;
  environment: FiscalEnvironment;
  company: FiscalCompanySettings;
  sale: FiscalSale;
}

export interface FiscalServiceOrder {
  id: string;
  customerName: string;
  customerDocument?: string | null;
  customerEmail?: string | null;
  serviceDescription: string;
  totalAmount: number;
}

export interface NfseIssueInput {
  reference: string;
  environment: FiscalEnvironment;
  company: FiscalCompanySettings;
  serviceOrder: FiscalServiceOrder;
}

export interface ProviderFiscalResult {
  status: FiscalDocumentStatus;
  providerStatus?: string;
  providerDocumentId?: string;
  number?: string;
  series?: string;
  accessKey?: string;
  protocol?: string;
  xmlUrl?: string;
  danfceUrl?: string;
  qrCodeUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  authorizedAt?: string;
  cancelledAt?: string;
  raw?: Record<string, unknown>;
}

export interface FiscalProvider {
  readonly name: FiscalProviderName;
  issueNfce(input: NfceIssueInput): Promise<ProviderFiscalResult>;
  getNfce(reference: string): Promise<ProviderFiscalResult>;
  cancelNfce(reference: string, reason: string): Promise<ProviderFiscalResult>;
  issueNfse(input: NfseIssueInput): Promise<ProviderFiscalResult>;
  getNfse(reference: string): Promise<ProviderFiscalResult>;
  cancelNfse(reference: string, reason: string): Promise<ProviderFiscalResult>;
  getServiceStatus(): Promise<{ status: 'ONLINE' | 'OFFLINE' | 'UNAVAILABLE' | 'UNKNOWN'; environment: FiscalEnvironment; lastCheck: string }>;
}
