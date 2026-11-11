import { FiscalProductIssueInput, FiscalProvider, NfseIssueInput, ProviderFiscalResult } from '../types';

export class MockFiscalProvider implements FiscalProvider {
  readonly name = 'mock' as const;

  async getNfce(reference: string): Promise<ProviderFiscalResult> {
    return {
      status: 'authorized',
      providerStatus: 'mock_authorized',
      providerDocumentId: `MOCK-NFCE-${reference}`,
      protocol: `MOCK-PROTOCOL-${reference.slice(-8).toUpperCase()}`,
      authorizedAt: new Date().toISOString(),
      raw: { reference, provider: this.name }
    };
  }

  async cancelNfce(reference: string, reason: string): Promise<ProviderFiscalResult> {
    return {
      status: 'cancelled',
      providerStatus: 'mock_cancelled',
      protocol: `MOCK-CANCEL-${reference.slice(-8).toUpperCase()}`,
      cancelledAt: new Date().toISOString(),
      raw: { reference, reasonLength: reason.length, provider: this.name }
    };
  }

  async issueNfe(input: FiscalProductIssueInput): Promise<ProviderFiscalResult> {
    const sequence = input.operationId.slice(0, 8).toUpperCase();
    return {
      status: 'authorized', providerStatus: 'mock_authorized', providerDocumentId: `MOCK-NFE-${sequence}`,
      number: `MOCK-${sequence}`, series: input.company.nfeSeries || '1',
      accessKey: `MOCK-NFE-${sequence}`, protocol: `MOCK-PROTOCOL-${sequence}`,
      xmlUrl: `/api/fiscal/mock/xml/${input.reference}`,
      danfceUrl: `/api/fiscal/mock/danfe/${input.reference}`,
      authorizedAt: new Date().toISOString(),
      raw: { reference: input.reference, provider: this.name, itemCount: input.sale.items.length }
    };
  }

  async getNfe(reference: string): Promise<ProviderFiscalResult> {
    return { status: 'authorized', providerStatus: 'mock_authorized', accessKey: `MOCK-NFE-${reference.slice(-8)}`, protocol: `MOCK-PROTOCOL-${reference.slice(-8)}`, authorizedAt: new Date().toISOString() };
  }

  async cancelNfe(reference: string, reason: string): Promise<ProviderFiscalResult> {
    return { status: 'cancelled', providerStatus: 'mock_cancelled', protocol: `MOCK-CANCEL-${reference.slice(-8)}`, cancelledAt: new Date().toISOString(), raw: { reasonLength: reason.length } };
  }

  async issueNfse(input: NfseIssueInput): Promise<ProviderFiscalResult> {
    const sequence = input.serviceOrder.id.slice(0, 8).toUpperCase();

    return {
      status: 'authorized',
      providerStatus: 'mock_authorized',
      providerDocumentId: `MOCK-NFSE-${sequence}`,
      number: `MOCK-${sequence}`,
      series: 'RPS-1',
      accessKey: `MOCK-NFSE-${sequence}`,
      protocol: `MOCK-PROTOCOL-${sequence}`,
      authorizedAt: new Date().toISOString(),
      raw: {
        reference: input.reference,
        provider: this.name,
        serviceOrderId: input.serviceOrder.id,
        totalAmount: input.serviceOrder.totalAmount
      }
    };
  }

  async getNfse(reference: string): Promise<ProviderFiscalResult> {
    return {
      status: 'authorized',
      providerStatus: 'mock_authorized',
      providerDocumentId: `MOCK-NFSE-${reference}`,
      protocol: `MOCK-PROTOCOL-${reference.slice(-8).toUpperCase()}`,
      authorizedAt: new Date().toISOString(),
      raw: { reference, provider: this.name }
    };
  }

  async cancelNfse(reference: string, reason: string): Promise<ProviderFiscalResult> {
    return {
      status: 'cancelled',
      providerStatus: 'mock_cancelled',
      protocol: `MOCK-CANCEL-${reference.slice(-8).toUpperCase()}`,
      cancelledAt: new Date().toISOString(),
      raw: { reference, reasonLength: reason.length, provider: this.name }
    };
  }

  async getServiceStatus() {
    return {
      status: 'ONLINE' as const,
      environment: 'mock' as const,
      lastCheck: new Date().toISOString()
    };
  }
}
