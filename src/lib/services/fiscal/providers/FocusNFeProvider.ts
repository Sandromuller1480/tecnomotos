import { mapFiscalPaymentMethod } from '../FiscalPaymentMapper';
import { FiscalEnvironment, FiscalProductIssueInput, FiscalProvider, NfseIssueInput, ProviderFiscalResult } from '../types';

const FOCUS_BASE_URLS: Record<Exclude<FiscalEnvironment, 'mock'>, string> = {
  homologation: 'https://homologacao.focusnfe.com.br',
  production: 'https://api.focusnfe.com.br'
};

const digitsOnly = (value?: string | null) => (value || '').replace(/\D/g, '');

const FOCUS_ITEM_TAX_FIELDS = new Set([
  'ipi_situacao_tributaria',
  'ipi_codigo_enquadramento_legal',
  'ipi_base_calculo',
  'ipi_aliquota',
  'ipi_valor',
  'pis_situacao_tributaria',
  'pis_base_calculo',
  'pis_aliquota_porcentual',
  'pis_valor',
  'cofins_situacao_tributaria',
  'cofins_base_calculo',
  'cofins_aliquota_porcentual',
  'cofins_valor',
  'icms_modalidade_base_calculo',
  'icms_base_calculo',
  'icms_aliquota',
  'icms_valor',
  'icms_base_calculo_retido_st',
  'icms_valor_retido_st',
  'fcp_percentual',
  'fcp_base_calculo',
  'fcp_valor',
  'ibs_cbs_situacao_tributaria',
  'ibs_cbs_classificacao_tributaria',
  'ibs_cbs_base_calculo',
  'ibs_uf_aliquota',
  'ibs_uf_valor',
  'ibs_mun_aliquota',
  'ibs_mun_valor',
  'ibs_valor_total',
  'cbs_aliquota',
  'cbs_valor'
]);

function focusItemTaxParameters(parameters?: Record<string, unknown>, includeIpi = true) {
  return Object.fromEntries(
    Object.entries(parameters || {}).filter(([key, value]) => (
      FOCUS_ITEM_TAX_FIELDS.has(key)
      && (includeIpi || !key.startsWith('ipi_'))
      && value !== undefined
      && value !== null
      && value !== ''
      && ['string', 'number', 'boolean'].includes(typeof value)
    ))
  );
}

type FocusStatus = string | undefined;

export class FocusNFeProvider implements FiscalProvider {
  readonly name = 'focusnfe' as const;

  constructor(private readonly environment: Exclude<FiscalEnvironment, 'mock'>) {}

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

  async issueNfe(input: FiscalProductIssueInput): Promise<ProviderFiscalResult> {
    const response = await this.request(`/v2/nfe?ref=${encodeURIComponent(input.reference)}&completa=1`, {
      method: 'POST', body: JSON.stringify(this.buildNfePayload(input))
    });
    return this.mapFocusResponse(response);
  }

  async getNfe(reference: string): Promise<ProviderFiscalResult> {
    const response = await this.request(`/v2/nfe/${encodeURIComponent(reference)}?completa=1`, { method: 'GET' });
    return this.mapFocusResponse(response);
  }

  async cancelNfe(reference: string, reason: string): Promise<ProviderFiscalResult> {
    if (reason.length < 15 || reason.length > 255) throw new Error('A justificativa de cancelamento deve ter entre 15 e 255 caracteres.');
    const response = await this.request(`/v2/nfe/${encodeURIComponent(reference)}`, { method: 'DELETE', body: JSON.stringify({ justificativa: reason }) });
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
    // The company-management endpoint is not exposed by the homologation host.
    // A missing NF-e reference still passes through Focus authentication:
    // valid token => 404, invalid token => 401.
    await this.request('/v2/nfe/tecnomotos-connection-check', { method: 'GET' }, [404]);

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

  private async request(path: string, init: RequestInit, acceptedStatuses: number[] = []) {
    const auth = Buffer.from(`${this.token}:`).toString('base64');
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      signal: init.signal || AbortSignal.timeout(20_000),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Basic ${auth}`,
        ...(init.headers || {})
      }
    });

    const text = await response.text();
    const payload = text ? this.parseJson(text) : {};

    if (!response.ok && !acceptedStatuses.includes(response.status)) {
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
    const summary = typeof message === 'string' ? message.trim() : '';
    const details = this.extractErrorDetails(
      source.erros || source.errors || source.detalhes || source.details
    );

    if (summary && details.length > 0) return `${summary}: ${details.join('; ')}`;
    if (summary) return summary;
    return details.length > 0 ? details.join('; ') : null;
  }

  private extractErrorDetails(value: unknown): string[] {
    const details: string[] = [];

    const visit = (entry: unknown) => {
      if (details.length >= 5 || entry == null) return;
      if (typeof entry === 'string') {
        const detail = entry.trim();
        if (detail && !details.includes(detail)) details.push(detail);
        return;
      }
      if (Array.isArray(entry)) {
        entry.forEach(visit);
        return;
      }
      if (typeof entry !== 'object') return;

      const record = entry as Record<string, unknown>;
      const field = record.campo || record.field;
      const message = record.mensagem || record.message || record.erro || record.error || record.descricao || record.description;
      if (typeof message === 'string') {
        const prefix = typeof field === 'string' && field.trim() ? `${field.trim()}: ` : '';
        visit(`${prefix}${message}`);
        return;
      }
      Object.values(record).forEach(visit);
    };

    visit(value);
    return details;
  }

  private buildNfePayload(input: FiscalProductIssueInput) {
    const paymentCode = mapFiscalPaymentMethod(input.sale.paymentMethod);
    const customerDocument = digitsOnly(input.sale.customerDocument);
    const isCnpj = customerDocument.length === 14;
    const isCpf = customerDocument.length === 11;

    return {
      cnpj_emitente: digitsOnly(input.company.cnpj),
      data_emissao: new Date().toISOString(),
      tipo_documento: '1',
      finalidade_emissao: '1',
      indicador_inscricao_estadual_destinatario: input.sale.taxpayerIndicator === 'contributor' ? '1' : input.sale.taxpayerIndicator === 'exempt' ? '2' : '9',
      inscricao_estadual_destinatario: input.sale.taxpayerIndicator === 'contributor' ? input.sale.customerStateRegistration || undefined : undefined,
      modalidade_frete: input.sale.freightMode === 'issuer' ? '0' : input.sale.freightMode === 'recipient' ? '1' : input.sale.freightMode === 'third_party' ? '2' : '9',
      local_destino: input.sale.destinationUf === input.company.uf ? '1' : '2',
      consumidor_final: input.sale.purchasePurpose === 'final_consumption' ? '1' : '0',
      presenca_comprador: input.sale.buyerPresence || '9',
      natureza_operacao: 'VENDA DE MERCADORIA',
      nome_destinatario: input.sale.customerName || undefined,
      email_destinatario: input.sale.customerEmail || undefined,
      cpf_destinatario: isCpf ? customerDocument : undefined,
      cnpj_destinatario: isCnpj ? customerDocument : undefined,
      serie: input.company.nfeSeries || undefined,
      uf_destinatario: input.sale.destinationUf || undefined,
      logradouro_destinatario: input.sale.destinationAddress?.street || undefined,
      numero_destinatario: input.sale.destinationAddress?.number || undefined,
      complemento_destinatario: input.sale.destinationAddress?.complement || undefined,
      bairro_destinatario: input.sale.destinationAddress?.neighborhood || undefined,
      municipio_destinatario: input.sale.destinationAddress?.city || undefined,
      cep_destinatario: digitsOnly(input.sale.destinationAddress?.postalCode) || undefined,
      pais_destinatario: 'Brasil',
      items: input.sale.items.map((item, index) => ({
        numero_item: String(index + 1),
        codigo_produto: item.sku || item.productId || item.id,
        descricao: item.name,
        codigo_ncm: digitsOnly(item.ncm),
        cest: digitsOnly(item.cest) || undefined,
        cfop: item.cfop,
        unidade_comercial: item.unit,
        quantidade_comercial: item.quantity,
        valor_unitario_comercial: item.unitPrice,
        valor_bruto: Number((item.quantity * item.unitPrice).toFixed(2)),
        unidade_tributavel: item.unit,
        quantidade_tributavel: item.quantity,
        valor_unitario_tributavel: item.unitPrice,
        codigo_barras_comercial: item.gtin || undefined,
        codigo_barras_tributavel: item.gtin || undefined,
        ...focusItemTaxParameters(item.taxParameters),
        icms_origem: String(item.origin),
        icms_situacao_tributaria: item.csosn || item.cst
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
      xmlUrl: this.resolveFocusUrl(this.firstString(response.caminho_xml_nota_fiscal, response.xml_url)),
      danfceUrl: this.resolveFocusUrl(this.firstString(response.caminho_danfe, response.danfce_url, response.danfe_url)),
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

  private resolveFocusUrl(value?: string) {
    if (!value) return undefined;

    try {
      return new URL(value, this.baseUrl).toString();
    } catch {
      return value;
    }
  }
}
