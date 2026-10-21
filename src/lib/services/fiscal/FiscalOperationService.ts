import { SupabaseClient } from '@supabase/supabase-js';
import { createFiscalProvider, getFiscalRuntimeConfig } from './FiscalProviderFactory';
import { validateNfceSale } from './validateNfceSale';
import { FiscalCompanySettings, FiscalDocumentStatus, FiscalSale, FiscalServiceOrder, ProviderFiscalResult } from './types';

type DatabaseClient = SupabaseClient<any, 'public', any>;

const digitsOnly = (value?: string | null) => (value || '').replace(/\D/g, '');

export class FiscalOperationService {
  constructor(private readonly db: DatabaseClient) {}

  async issueNfce(orderId: string, fallback?: Partial<FiscalSale>) {
    const config = getFiscalRuntimeConfig();
    const existing = await this.getExistingDocument(orderId);

    if (existing && ['pending', 'processing', 'authorized', 'cancelled', 'EMITTED', 'CANCELLED'].includes(existing.status)) {
      return { document: existing, reused: true };
    }

    const sale = await this.loadSale(orderId, fallback);
    const company = await this.loadCompanySettings();
    const validationErrors = validateNfceSale(company, sale);

    if (validationErrors.length > 0) {
      throw new Error(validationErrors[0]);
    }

    const operation = await this.claimOperation(orderId, config.provider, config.environment);
    await this.updateOperation(operation.id, 'processing');
    await this.log('fiscal.issue.start', null, operation.reference, 'processing', 'Emissao NFC-e iniciada.');

    const provider = createFiscalProvider();

    try {
      const result = await provider.issueNfce({
        operationId: operation.id,
        reference: operation.reference,
        environment: config.environment,
        company,
        sale
      });

      const document = await this.saveDocument(operation.id, orderId, operation.reference, result, company, sale);
      await this.updateOperation(operation.id, result.status, result.errorMessage);
      await this.log(
        result.status === 'authorized' ? 'fiscal.issue.success' : 'fiscal.issue.rejected',
        document.id,
        operation.reference,
        result.status,
        result.errorMessage || result.providerStatus || 'Resposta fiscal processada.',
        result
      );

      return { document, reused: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao emitir NFC-e.';
      await this.updateOperation(operation.id, 'error', message);
      await this.log('fiscal.issue.error', null, operation.reference, 'error', message);
      throw error;
    }
  }

  async issueNfse(serviceOrderId: string) {
    const config = getFiscalRuntimeConfig();
    const existing = await this.getExistingServiceDocument(serviceOrderId);

    if (existing && ['pending', 'processing', 'authorized', 'cancelled', 'EMITTED', 'CANCELLED'].includes(existing.status)) {
      return { document: existing, reused: true };
    }

    const serviceOrder = await this.loadServiceOrder(serviceOrderId);
    const company = await this.loadCompanySettings();
    const reference = `tecnomotos-nfse-${serviceOrderId}`;
    const provider = createFiscalProvider();

    try {
      const result = await provider.issueNfse({
        reference,
        environment: config.environment,
        company,
        serviceOrder
      });

      const document = await this.saveServiceDocument(serviceOrderId, reference, result, company, serviceOrder);
      await this.log(
        result.status === 'authorized' ? 'fiscal.nfse.issue.success' : 'fiscal.nfse.issue.rejected',
        document.id,
        reference,
        result.status,
        result.errorMessage || result.providerStatus || 'Resposta da NFS-e processada.',
        result
      );

      return { document, reused: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao emitir NFS-e.';
      await this.log('fiscal.nfse.issue.error', null, reference, 'error', message);
      throw error;
    }
  }

  async queryDocument(documentId: string) {
    const { data: document, error } = await this.db
      .from('fiscal_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error || !document?.reference) {
      throw new Error('Documento fiscal nao encontrado para consulta.');
    }

    const provider = createFiscalProvider();
    const isNfse = document.document_type === 'NFSE';
    await this.log('fiscal.query.start', document.id, document.reference, document.status, `Consulta ${isNfse ? 'NFS-e' : 'NFC-e'} iniciada.`);
    const result = isNfse
      ? await provider.getNfse(document.reference)
      : await provider.getNfce(document.reference);
    const updated = await this.applyProviderResult(document.id, result);

    if (document.fiscal_operation_id) {
      await this.updateOperation(document.fiscal_operation_id, result.status, result.errorMessage);
    }

    await this.log('fiscal.query.success', document.id, document.reference, result.status, result.errorMessage || 'Consulta NFC-e atualizada.', result);

    return updated;
  }

  async cancelDocument(documentId: string, reason: string) {
    if (reason.length < 15 || reason.length > 255) {
      throw new Error('A justificativa de cancelamento deve ter entre 15 e 255 caracteres.');
    }

    const { data: document, error } = await this.db
      .from('fiscal_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error || !document?.reference) {
      throw new Error('Documento fiscal nao encontrado para cancelamento.');
    }

    if (!['authorized', 'EMITTED'].includes(document.status)) {
      throw new Error('Somente uma nota autorizada pode ser cancelada.');
    }

    const provider = createFiscalProvider();
    const isNfse = document.document_type === 'NFSE';
    await this.log('fiscal.cancel.start', document.id, document.reference, document.status, `Cancelamento ${isNfse ? 'NFS-e' : 'NFC-e'} iniciado.`);
    const result = isNfse
      ? await provider.cancelNfse(document.reference, reason)
      : await provider.cancelNfce(document.reference, reason);
    const updated = await this.applyProviderResult(document.id, result);

    if (document.fiscal_operation_id) {
      await this.updateOperation(document.fiscal_operation_id, result.status, result.errorMessage);
    }

    await this.log('fiscal.cancel.success', document.id, document.reference, result.status, 'Cancelamento NFC-e processado.', { reasonLength: reason.length, ...result });

    return updated;
  }

  async applyWebhook(reference: string, payloadHash: string, payload: Record<string, unknown>) {
    const { data: inserted, error: insertError } = await this.db
      .from('fiscal_webhook_events')
      .insert({ reference, payload_hash: payloadHash, status: 'received' })
      .select()
      .single();

    if (insertError) {
      return { duplicate: true };
    }

    const { data: document } = await this.db
      .from('fiscal_documents')
      .select('*')
      .eq('reference', reference)
      .maybeSingle();

    if (!document) {
      await this.db
        .from('fiscal_webhook_events')
        .update({ status: 'error', error_message: 'Documento nao encontrado.', processed_at: new Date().toISOString() })
        .eq('id', inserted.id);
      return { duplicate: false, processed: false };
    }

    const providerResult = this.mapWebhookPayload(payload);
    const updated = await this.applyProviderResult(document.id, providerResult);

    await this.db
      .from('fiscal_webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', inserted.id);

    await this.log('fiscal.webhook.processed', document.id, reference, providerResult.status, 'Webhook Focus NFe processado.', providerResult);

    return { duplicate: false, processed: true, document: updated };
  }

  private async loadCompanySettings(): Promise<FiscalCompanySettings> {
    const { data } = await this.db.from('fiscal_settings').select('*').limit(1).maybeSingle();

    return {
      companyName: data?.company_name || 'TECNOMOTOS',
      cnpj: data?.cnpj || process.env.FISCAL_CNPJ || '',
      stateRegistration: data?.state_registration || process.env.FISCAL_IE || null,
      uf: data?.uf || process.env.FISCAL_UF || 'MT',
      city: data?.city || 'Tangara da Serra',
      ibgeCityCode: data?.ibge_city_code || '5107958',
      crt: data?.crt || process.env.FISCAL_CRT || null,
      nfceSeries: data?.nfce_series || process.env.FISCAL_NFCE_SERIES || null
    };
  }

  private async loadSale(orderId: string, fallback?: Partial<FiscalSale>): Promise<FiscalSale> {
    const { data: order, error } = await this.db
      .from('orders')
      .select(`
        id,
        customer_email,
        customer_id,
        total_amount,
        status,
        order_items (
          id,
          quantity,
          unit_price,
          products: product_id (
            id,
            sku,
            name,
            gtin,
            barcode,
            ncm,
            cest,
            cfop,
            cst,
            csosn,
            origin,
            fiscal_origin,
            unit,
            taxable_unit
          )
        )
      `)
      .eq('id', orderId)
      .single();

    if (error || !order) throw new Error('Venda nao encontrada para emissao fiscal.');
    if (order.status !== 'paid') throw new Error('A NFC-e so pode ser emitida para pedido com pagamento aprovado.');

    const items = (order.order_items || []).map((item: any) => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      return {
        id: item.id,
        productId: product?.id,
        sku: product?.sku,
        name: product?.name || 'Item do pedido',
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unit_price) || 0,
        ncm: product?.ncm,
        cest: product?.cest,
        cfop: product?.cfop,
        cst: product?.cst,
        csosn: product?.csosn,
        origin: product?.fiscal_origin ?? product?.origin,
        unit: product?.taxable_unit || product?.unit,
        gtin: product?.gtin || product?.barcode
      };
    });

    return {
      id: order.id,
      customerEmail: order.customer_email,
      customerName: fallback?.customerName || order.customer_email,
      customerDocument: fallback?.customerDocument || null,
      totalAmount: Number(order.total_amount) || 0,
      paymentMethod: fallback?.paymentMethod || 'other',
      items
    };
  }

  private async loadServiceOrder(serviceOrderId: string): Promise<FiscalServiceOrder> {
    const { data: serviceOrder, error } = await this.db
      .from('service_orders')
      .select(`
        id,
        service_type,
        description,
        status,
        total_price,
        customer:customers!service_orders_customer_id_fkey (
          document,
          profiles!customers_id_fkey (
            full_name,
            email
          )
        )
      `)
      .eq('id', serviceOrderId)
      .single();

    if (error || !serviceOrder) throw new Error('Ordem de serviço não encontrada para emissão fiscal.');
    if (serviceOrder.status !== 'COMPLETED') throw new Error('A NFS-e só pode ser emitida para uma ordem de serviço concluída.');

    const customer = Array.isArray(serviceOrder.customer) ? serviceOrder.customer[0] : serviceOrder.customer;
    const profile = Array.isArray(customer?.profiles) ? customer.profiles[0] : customer?.profiles;
    const totalAmount = Number(serviceOrder.total_price) || 0;

    if (totalAmount <= 0) throw new Error('A ordem de serviço precisa ter valor de mão de obra maior que zero.');

    return {
      id: serviceOrder.id,
      customerName: profile?.full_name || 'Consumidor não identificado',
      customerDocument: customer?.document || null,
      customerEmail: profile?.email || null,
      serviceDescription: serviceOrder.description || serviceOrder.service_type,
      totalAmount
    };
  }

  private async getExistingDocument(orderId: string) {
    const { data } = await this.db
      .from('fiscal_documents')
      .select('*')
      .or(`sale_id.eq.${orderId},order_id.eq.${orderId}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data;
  }

  private async getExistingServiceDocument(serviceOrderId: string) {
    const { data } = await this.db
      .from('fiscal_documents')
      .select('*')
      .eq('document_type', 'NFSE')
      .eq('order_id', serviceOrderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data;
  }

  private async claimOperation(orderId: string, provider: string, environment: string) {
    const existing = await this.db
      .from('fiscal_operations')
      .select('*')
      .eq('sale_id', orderId)
      .eq('operation_type', 'issue')
      .eq('document_type', 'NFCE')
      .in('status', ['pending', 'processing', 'authorized', 'contingency'])
      .maybeSingle();

    if (existing.data) return existing.data;

    const { data, error } = await this.db
      .from('fiscal_operations')
      .insert({
        sale_id: orderId,
        operation_type: 'issue',
        document_type: 'NFCE',
        reference: `tecnomotos-nfce-${orderId}`,
        provider,
        environment,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      const retry = await this.db
        .from('fiscal_operations')
        .select('*')
        .eq('sale_id', orderId)
        .eq('operation_type', 'issue')
        .eq('document_type', 'NFCE')
        .single();

      if (retry.data) return retry.data;
      throw error;
    }

    return data;
  }

  private async saveDocument(
    operationId: string,
    orderId: string,
    reference: string,
    result: ProviderFiscalResult,
    company: FiscalCompanySettings,
    sale: FiscalSale
  ) {
    const payload = {
      fiscal_operation_id: operationId,
      order_id: orderId,
      sale_id: orderId,
      provider: getFiscalRuntimeConfig().provider,
      document_type: 'NFCE',
      model: '65',
      environment: getFiscalRuntimeConfig().environment,
      reference,
      status: result.status,
      invoice_number: result.number,
      series: result.series,
      access_key: result.accessKey,
      protocol: result.protocol,
      xml_url: result.xmlUrl,
      danfe_url: result.danfceUrl,
      qrcode_url: result.qrCodeUrl,
      provider_document_id: result.providerDocumentId,
      provider_status: result.providerStatus,
      error_code: result.errorCode,
      error_message: result.errorMessage,
      issuer_cnpj: digitsOnly(company.cnpj),
      recipient_cpf_cnpj: digitsOnly(sale.customerDocument),
      total_amount: sale.totalAmount,
      issued_at: new Date().toISOString(),
      authorized_at: result.authorizedAt,
      cancelled_at: result.cancelledAt
    };

    const { data, error } = await this.db
      .from('fiscal_documents')
      .upsert(payload, { onConflict: 'reference' })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  private async saveServiceDocument(
    serviceOrderId: string,
    reference: string,
    result: ProviderFiscalResult,
    company: FiscalCompanySettings,
    serviceOrder: FiscalServiceOrder
  ) {
    const payload = {
      order_id: serviceOrderId,
      sale_id: null,
      provider: getFiscalRuntimeConfig().provider,
      document_type: 'NFSE',
      model: 'NFS-e',
      environment: getFiscalRuntimeConfig().environment,
      reference,
      status: result.status,
      invoice_number: result.number,
      series: result.series,
      access_key: result.accessKey,
      protocol: result.protocol,
      xml_url: result.xmlUrl,
      danfe_url: result.danfceUrl,
      provider_document_id: result.providerDocumentId,
      provider_status: result.providerStatus,
      error_code: result.errorCode,
      error_message: result.errorMessage,
      issuer_cnpj: digitsOnly(company.cnpj),
      recipient_cpf_cnpj: digitsOnly(serviceOrder.customerDocument),
      total_amount: serviceOrder.totalAmount,
      issued_at: new Date().toISOString(),
      authorized_at: result.authorizedAt,
      cancelled_at: result.cancelledAt
    };

    const { data, error } = await this.db
      .from('fiscal_documents')
      .upsert(payload, { onConflict: 'reference' })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  private async applyProviderResult(documentId: string, result: ProviderFiscalResult) {
    const { data, error } = await this.db
      .from('fiscal_documents')
      .update({
        status: result.status,
        invoice_number: result.number,
        series: result.series,
        access_key: result.accessKey,
        protocol: result.protocol,
        xml_url: result.xmlUrl,
        danfe_url: result.danfceUrl,
        qrcode_url: result.qrCodeUrl,
        provider_document_id: result.providerDocumentId,
        provider_status: result.providerStatus,
        error_code: result.errorCode,
        error_message: result.errorMessage,
        authorized_at: result.authorizedAt,
        cancelled_at: result.cancelledAt
      })
      .eq('id', documentId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  private async updateOperation(operationId: string, status: FiscalDocumentStatus, lastError?: string) {
    await this.db
      .from('fiscal_operations')
      .update({ status, last_error: lastError || null })
      .eq('id', operationId);
  }

  private async log(
    eventType: string,
    documentId: string | null,
    reference: string,
    status: string,
    message: string,
    metadata: unknown = {}
  ) {
    if (!documentId) return;

    await this.db.from('fiscal_events').insert({
      document_id: documentId,
      fiscal_document_id: documentId,
      event_type: eventType,
      provider: getFiscalRuntimeConfig().provider,
      reference,
      status,
      message,
      provider_code: typeof metadata === 'object' && metadata && 'errorCode' in metadata && typeof metadata.errorCode === 'string' ? metadata.errorCode : null,
      metadata
    });
  }

  private mapWebhookPayload(payload: Record<string, unknown>): ProviderFiscalResult {
    const status = String(payload.status || '').toLowerCase();
    return {
      status: status.includes('cancel') ? 'cancelled' : status.includes('autor') ? 'authorized' : status.includes('process') ? 'processing' : status.includes('reje') || status.includes('erro') ? 'rejected' : 'error',
      providerStatus: typeof payload.status === 'string' ? payload.status : undefined,
      number: payload.numero ? String(payload.numero) : undefined,
      series: payload.serie ? String(payload.serie) : undefined,
      accessKey: payload.chave_nfe ? String(payload.chave_nfe) : undefined,
      protocol: payload.protocolo ? String(payload.protocolo) : undefined,
      xmlUrl: payload.caminho_xml_nota_fiscal ? String(payload.caminho_xml_nota_fiscal) : undefined,
      danfceUrl: payload.caminho_danfe ? String(payload.caminho_danfe) : undefined,
      qrCodeUrl: payload.qrcode_url ? String(payload.qrcode_url) : undefined,
      errorMessage: payload.mensagem ? String(payload.mensagem) : undefined,
      raw: payload
    };
  }
}
