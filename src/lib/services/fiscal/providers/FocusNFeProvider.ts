import { mapFiscalPaymentMethod } from '../FiscalPaymentMapper';
import { FiscalEnvironment, FiscalProvider, NfceIssueInput, NfseIssueInput, ProviderFiscalResult } from '../types';

const FOCUS_BASE_URLS: Record<Exclude<FiscalEnvironment, 'mock'>, string> = {
  homologation: 'https://homologacao.focusnfe.com.br',
  production: 'https://api.focusnfe.com.br'
};

const digitsOnly = (value?: string | null) => (value || '').replace(/\D/g, '');

type FocusStatus = string | undefined;

export class FocusNFeProvider implements FiscalProvider {
  readonly name = 'focusnfe' as const;

  constructor(private readonly environment: Exclude<FiscalEnvironment, 'mock'>) {}

  async issueNfce(input: NfceIssueInput): Promise<ProviderFiscalResult> {
    const payload = this.buildNfcePayload(input);
    const response = await this.request(`/v2/nfce?ref=${encodeURIComponent(input.reference)}&completa=1`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return this.mapFocusResponse(response);
  }

  async getNfce(reference: string): Promise<ProviderFiscalResult> {
    const response = await this.request(`/v2/nfce/${encodeURIComponent(reference)}?completa=1`, {
      method: 'GET'
    });

    return this.mapFocusResponse(response);
  }

  async cancelNfce(reference: string, reason: string): Promise<ProviderFiscalResult> {
    if (reason.length < 15 || reason.length > 255) {
      throw new Error('A justificativa de cancelamento deve ter entre 15 e 255 caracteres.');
    }

    const response = await this.request(`/v2/nfce/${encodeURIComponent(reference)}`, {
      method: 'DELETE',
      body: JSON.stringify({ justificativa: reason })
    });

    return this.mapFocusResponse(response);
  }

  async issueNfse(_input: NfseIssueInput): Promise<ProviderFiscalResult> {
    throw new Error('Emissão de NFS-e pela Focus NFe ainda não está habilitada.');
  }

  async getNfse(_reference: string): Promise<ProviderFiscalResult> {
    throw new Error('Consulta de NFS-e pela Focus NFe ainda não está habilitada.');
  }

  async cancelNfse(_reference: string, _reason: string): Promise<ProviderFiscalResult> {
    throw new Error('Cancelamento de NFS-e pela Focus NFe ainda não está habilitado.');
  }

  async getServiceStatus() {
    await this.request('/v2/empresas', { method: 'GET' });

    return {
      status: 'ONLINE' as const,
      environment: this.environment,
      lastCheck: new Date().toISOString()
    };
  }

  private get baseUrl() {
    return FOCUS_BASE_URLS[this.environment];
  }

  private get token() {
    const token = this.environment === 'production'
      ? process.env.FOCUS_NFE_PRODUCTION_TOKEN
      : process.env.FOCUS_NFE_HOMOLOGATION_TOKEN;

    if (!token) {
      throw new Error(`Token Focus NFe nao configurado para ${this.environment}.`);
    }

    return token;
  }

  private async request(path: string, init: RequestInit) {
    const auth = Buffer.from(`${this.token}:`).toString('base64');
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Basic ${auth}`,
        ...(init.headers || {})
      }
    });

    const text = await response.text();
    const payload = text ? this.parseJson(text) : {};

    if (!response.ok) {
      const message = this.extractMessage(payload) || `Focus NFe retornou HTTP ${response.status}.`;
      const error = new Error(message);
      (error as Error & { payload?: unknown }).payload = payload;
      throw error;
    }

    return payload as Record<string, unknown>;
  }

  private parseJson(text: string) {
    try {
      return JSON.parse(text);
    } catch {
      return { mensagem: text };
    }
  }

  private extractMessage(payload: unknown) {
    if (!payload || typeof payload !== 'object') return null;
    const source = payload as Record<string, unknown>;
    const message = source.mensagem || source.message || source.erro || source.status_sefaz;
    return typeof message === 'string' ? message : null;
  }

  private buildNfcePayload(input: NfceIssueInput) {
    const paymentCode = mapFiscalPaymentMethod(input.sale.paymentMethod);
    const customerDocument = digitsOnly(input.sale.customerDocument);
    const isCnpj = customerDocument.length === 14;
    const isCpf = customerDocument.length === 11;

    return {
      cnpj_emitente: digitsOnly(input.company.cnpj),
      data_emissao: new Date().toISOString(),
      indicador_inscricao_estadual_destinatario: '9',
      modalidade_frete: '9',
      local_destino: '1',
      presenca_comprador: '1',
      natureza_operacao: 'VENDA AO CONSUMIDOR',
      nome_destinatario: input.sale.customerName || undefined,
      cpf_destinatario: isCpf ? customerDocument : undefined,
      cnpj_destinatario: isCnpj ? customerDocument : undefined,
      serie: input.company.nfceSeries || undefined,
      items: input.sale.items.map((item, index) => ({
        numero_item: String(index + 1),
        codigo_produto: item.sku || item.productId || item.id,
        descricao: item.name,
        codigo_ncm: digitsOnly(item.ncm),
        cest: digitsOnly(item.cest),
        cfop: item.cfop,
        unidade_comercial: item.unit,
        quantidade_comercial: item.quantity,
        valor_unitario_comercial: item.unitPrice,
        valor_bruto: Number((item.quantity * item.unitPrice).toFixed(2)),
        unidade_tributavel: item.unit,
        quantidade_tributavel: item.quantity,
        valor_unitario_tributavel: item.unitPrice,
        gtin: item.gtin || undefined,
        gtin_tributavel: item.gtin || undefined,
        origem: item.origin,
        cst_icms: item.cst || undefined,
        csosn: item.csosn || undefined
      })),
      formas_pagamento: [{
        forma_pagamento: paymentCode,
        valor_pagamento: input.sale.totalAmount
      }]
    };
  }

  private mapFocusResponse(response: Record<string, unknown>): ProviderFiscalResult {
    const status = this.mapStatus(response.status as FocusStatus);
    const protocol = this.firstString(response.protocolo, response.numero_protocolo, response.protocolo_autorizacao);
    const errorMessage = this.firstString(response.mensagem_sefaz, response.status_sefaz, response.mensagem, response.erro);

    return {
      status,
      providerStatus: this.firstString(response.status),
      providerDocumentId: this.firstString(response.id, response.ref),
      number: this.firstString(response.numero),
      series: this.firstString(response.serie),
      accessKey: this.firstString(response.chave_nfe, response.chave, response.chave_acesso),
      protocol,
      xmlUrl: this.firstString(response.caminho_xml_nota_fiscal, response.xml_url),
      danfceUrl: this.firstString(response.caminho_danfe, response.danfce_url, response.danfe_url),
      qrCodeUrl: this.firstString(response.qrcode_url, response.qr_code_url, response.qrcode),
      errorCode: this.firstString(response.codigo, response.codigo_sefaz),
      errorMessage: status === 'authorized' ? undefined : errorMessage,
      authorizedAt: status === 'authorized' ? new Date().toISOString() : undefined,
      cancelledAt: status === 'cancelled' ? new Date().toISOString() : undefined,
      raw: response
    };
  }

  private mapStatus(status: FocusStatus) {
    switch ((status || '').toLowerCase()) {
      case 'autorizado':
      case 'autorizada':
      case 'authorized':
        return 'authorized';
      case 'processando_autorizacao':
      case 'processando':
      case 'processing':
        return 'processing';
      case 'cancelado':
      case 'cancelada':
      case 'cancelled':
        return 'cancelled';
      case 'rejeitado':
      case 'rejeitada':
      case 'erro_autorizacao':
      case 'denegado':
        return 'rejected';
      default:
        return 'error';
    }
  }

  private firstString(...values: unknown[]) {
    const value = values.find((entry) => entry !== undefined && entry !== null && String(entry).length > 0);
    return value === undefined ? undefined : String(value);
  }
}
