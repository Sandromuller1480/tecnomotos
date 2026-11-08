import { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { createFiscalProvider, getFiscalRuntimeConfig } from './FiscalProviderFactory';
import { validateNfceSale } from './validateNfceSale';
import { FiscalCompanySettings, FiscalDocumentStatus, FiscalSale, FiscalServiceOrder, ProviderFiscalResult } from './types';
import { determineDocumentModel, FiscalResolutionContext, FiscalRuleRecord, resolveFiscalItem } from '@/lib/fiscal/rules/engine';

type DatabaseClient = SupabaseClient<any, 'public', any>;

const digitsOnly = (value?: string | null) => (value || '').replace(/\D/g, '');

function fiscalErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (!error || typeof error !== 'object') return fallback;

  const source = error as Record<string, unknown>;
  const detail = [source.message, source.details, source.hint]
    .find((value) => typeof value === 'string' && value.trim());
  const code = typeof source.code === 'string' && source.code.trim() ? source.code.trim() : null;

  if (typeof detail === 'string') return code ? `${code}: ${detail}` : detail;
  return fallback;
}

export class FiscalOperationService {
  constructor(private readonly db: DatabaseClient) {}

  async issueNfce(orderId: string, fallback?: Partial<FiscalSale>) {
    const config = getFiscalRuntimeConfig();
    const existing = await this.getExistingDocument(orderId);

    if (existing && ['pending', 'processing', 'authorized', 'cancelled', 'EMITTED', 'CANCELLED'].includes(existing.status)) {
      return { document: existing, reused: true };
    }

    let sale = await this.loadSale(orderId, fallback);
    const company = await this.loadCompanySettings();
    sale = await this.resolveSaleItems(sale, company);
    const validationErrors = validateNfceSale(company, sale);

    if (validationErrors.length > 0) {
      throw new Error(validationErrors[0]);
    }

    await this.saveFiscalPreview(orderId, sale);

    const operation = await this.claimOperation(orderId, config.provider, config.environment, sale.documentModel!);
    await this.updateOperation(operation.id, 'processing');
    await this.log('fiscal.issue.start', null, operation.reference, 'processing', 'Emissao NFC-e iniciada.');

    const provider = createFiscalProvider();

    try {
      const issueInput = {
        operationId: operation.id,
        reference: operation.reference,
        environment: config.environment,
        company,
        sale
      };
      const result = sale.documentModel === '55' ? await provider.issueNfe(issueInput) : await provider.issueNfce(issueInput);

      const document = await this.saveDocument(operation.id, orderId, operation.reference, result, company, sale);
      await this.db.from('fiscal_previews').update({ status: 'used' }).eq('sale_id', orderId).eq('status', 'ready');
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
      const message = fiscalErrorMessage(error, 'Erro ao emitir NFC-e.');
      try {
        const reconciled = sale.documentModel === '55'
          ? await provider.getNfe(operation.reference)
          : await provider.getNfce(operation.reference);
        if (['processing', 'authorized', 'rejected', 'cancelled'].includes(reconciled.status)) {
          const document = await this.saveDocument(operation.id, orderId, operation.reference, reconciled, company, sale);
          await this.updateOperation(operation.id, reconciled.status, reconciled.errorMessage);
          await this.log('fiscal.issue.reconciled', document.id, operation.reference, reconciled.status, 'Emissão reconciliada por consulta após falha de comunicação.', reconciled);
          return { document, reused: true };
        }
      } catch {
        // A failed reconciliation keeps the stable operation reference available for a later retry.
      }
      await this.updateOperation(operation.id, 'error', message);
      await this.log('fiscal.issue.error', null, operation.reference, 'error', message);
      throw error instanceof Error ? error : new Error(message);
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
    const isNfe = document.document_type === 'NFE';
    await this.log('fiscal.query.start', document.id, document.reference, document.status, `Consulta ${isNfse ? 'NFS-e' : 'NFC-e'} iniciada.`);
    const result = isNfse ? await provider.getNfse(document.reference) : isNfe ? await provider.getNfe(document.reference) : await provider.getNfce(document.reference);
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
    const isNfe = document.document_type === 'NFE';
    await this.log('fiscal.cancel.start', document.id, document.reference, document.status, `Cancelamento ${isNfse ? 'NFS-e' : 'NFC-e'} iniciado.`);
    const result = isNfse ? await provider.cancelNfse(document.reference, reason) : isNfe ? await provider.cancelNfe(document.reference, reason) : await provider.cancelNfce(document.reference, reason);
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
      if (insertError.code === '23505') return { duplicate: true };
      throw insertError;
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

    const runtime = getFiscalRuntimeConfig();
    const payloadCnpj = digitsOnly(String(payload.cnpj_emitente || ''));
    if (document.environment !== runtime.environment || (payloadCnpj && payloadCnpj !== digitsOnly(document.issuer_cnpj))) {
      await this.db.from('fiscal_webhook_events').update({ status: 'error', error_message: 'Empresa ou ambiente divergente.', processed_at: new Date().toISOString() }).eq('id', inserted.id);
      return { duplicate: false, processed: false };
    }

    const providerResult = this.mapWebhookPayload(payload);
    if (!this.canApplyWebhookStatus(document.status, providerResult.status)) {
      await this.db.from('fiscal_webhook_events').update({ status: 'processed', processed_at: new Date().toISOString() }).eq('id', inserted.id);
      return { duplicate: false, processed: true, ignoredOutOfOrder: true, document };
    }
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
      nfceSeries: data?.nfce_series || process.env.FISCAL_NFCE_SERIES || null,
      nfeSeries: data?.nfe_series || process.env.FISCAL_NFE_SERIES || null
    };
  }

  private async loadSale(orderId: string, fallback?: Partial<FiscalSale>): Promise<FiscalSale> {
    const { data: order, error } = await this.db
      .from('orders')
      .select(`
        id,
        customer_email,
        customer_id,
        customer_name,
        payment_method,
        sales_channel,
        delivery_address_id,
        delivery_mode,
        purchase_purpose,
        fiscal_taxpayer_indicator,
        fiscal_state_registration,
        fiscal_recipient_document,
        fiscal_freight_mode,
        fiscal_destination_street,
        fiscal_destination_number,
        fiscal_destination_complement,
        fiscal_destination_neighborhood,
        fiscal_destination_city,
        fiscal_destination_uf,
        fiscal_destination_postal_code,
        total_amount,
        products_total,
        status,
        order_items (
          id,
          item_type,
          description,
          quantity,
          unit_price,
          total_price,
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
            ,without_gtin
            ,fiscal_status
            ,fiscal_tax_profile_id
          )
        )
      `)
      .eq('id', orderId)
      .single();

    if (error || !order) throw new Error('Venda nao encontrada para emissao fiscal.');
    if (order.status !== 'paid') throw new Error('A NFC-e so pode ser emitida para pedido com pagamento aprovado.');

    let customer: any = null;
    let address: any = null;
    if (order.customer_id) {
      const customerResult = await this.db.from('customers').select('document, state_registration, icms_taxpayer_indicator, purchase_purpose').eq('id', order.customer_id).maybeSingle();
      customer = customerResult.data;
      const addressQuery = this.db.from('customer_addresses').select('street, number, complement, neighborhood, city, state, postal_code').eq('customer_id', order.customer_id);
      const addressResult = order.delivery_address_id
        ? await addressQuery.eq('id', order.delivery_address_id).maybeSingle()
        : await addressQuery.eq('is_default', true).maybeSingle();
      address = addressResult.data;
    }

    const items = (order.order_items || []).filter((item: any) => item.item_type !== 'SERVICE').map((item: any) => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      return {
        id: item.id,
        productId: product?.id,
        sku: product?.sku,
        name: item.description || product?.name || 'Item do pedido',
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
        ,withoutGtin: product?.without_gtin
        ,fiscalStatus: product?.fiscal_status || 'pending'
        ,fiscalProfileId: product?.fiscal_tax_profile_id
      };
    });

    return {
      id: order.id,
      customerEmail: order.customer_email,
      customerName: fallback?.customerName || order.customer_name || order.customer_email,
      customerDocument: order.fiscal_recipient_document || customer?.document || fallback?.customerDocument || null,
      customerStateRegistration: order.fiscal_state_registration || customer?.state_registration || null,
      totalAmount: Number(order.products_total) || Number(order.total_amount) || 0,
      paymentMethod: order.payment_method || fallback?.paymentMethod || 'other',
      buyerPresence: order.sales_channel === 'ONLINE' ? '2' : '1',
      freightMode: order.delivery_mode === 'pickup' ? 'none' : order.fiscal_freight_mode || 'none',
      destinationUf: order.fiscal_destination_uf || address?.state || (order.delivery_mode === 'pickup' ? process.env.FISCAL_UF || 'MT' : null),
      taxpayerIndicator: order.fiscal_taxpayer_indicator || customer?.icms_taxpayer_indicator || null,
      purchasePurpose: order.purchase_purpose || customer?.purchase_purpose || null,
      destinationAddress: {
        street: order.fiscal_destination_street || address?.street,
        number: order.fiscal_destination_number || address?.number,
        complement: order.fiscal_destination_complement || address?.complement,
        neighborhood: order.fiscal_destination_neighborhood || address?.neighborhood,
        city: order.fiscal_destination_city || address?.city,
        state: order.fiscal_destination_uf || address?.state,
        postalCode: order.fiscal_destination_postal_code || address?.postal_code
      },
      items
    };
  }

  private async resolveSaleItems(sale: FiscalSale, company: FiscalCompanySettings): Promise<FiscalSale> {
    if (!sale.destinationUf) throw new Error('Informe o destino efetivo da mercadoria antes de preparar a nota.');
    if (!sale.taxpayerIndicator) throw new Error('Confirme a situação de contribuinte do ICMS do cliente.');
    if (!sale.purchasePurpose) throw new Error('Informe se a compra é para revenda ou consumo final.');
    const destinationScope = sale.destinationUf.toUpperCase() === company.uf.toUpperCase() ? 'internal' : 'interstate';
    const documentModel = determineDocumentModel({
      destinationScope,
      nfceEligible: destinationScope === 'internal' && sale.taxpayerIndicator === 'non_contributor' && sale.purchasePurpose === 'final_consumption'
    });
    const { data, error } = await this.db.from('fiscal_rules').select('*').eq('status', 'approved');
    if (error) throw new Error(`Não foi possível carregar as regras fiscais: ${error.message}`);
    const rules: FiscalRuleRecord[] = (data || []).map((rule: any) => ({
      id: rule.id, name: rule.name, version: rule.version, status: rule.status, companyCrt: rule.company_crt,
      fiscalProfileId: rule.fiscal_profile_id, operationType: rule.operation_type, documentModel: rule.document_model,
      originScope: rule.origin_scope, destinationScope: rule.destination_scope, destinationUf: rule.destination_uf,
      taxpayerIndicator: rule.taxpayer_indicator, purchasePurpose: rule.purchase_purpose, cfop: rule.cfop,
      csosn: rule.csosn, cstIcms: rule.cst_icms, taxParameters: rule.tax_parameters,
      validFrom: rule.valid_from, validTo: rule.valid_to, approvedBy: rule.approved_by, approvedAt: rule.approved_at, source: rule.source
    }));
    const context: FiscalResolutionContext = {
      companyCrt: company.crt || '', issuerUf: company.uf, destinationUf: sale.destinationUf.toUpperCase(),
      destinationScope, taxpayerIndicator: sale.taxpayerIndicator, purchasePurpose: sale.purchasePurpose,
      operationType: 'sale', documentModel, occurredAt: new Date()
    };
    const resolvedSale = {
      ...sale,
      documentModel,
      items: sale.items.map((item) => {
        const resolved = resolveFiscalItem(context, {
          id: item.productId || item.id, sku: item.sku, name: item.name, fiscalStatus: item.fiscalStatus || 'pending',
          fiscalProfileId: item.fiscalProfileId, ncm: item.ncm, cest: item.cest, origin: item.origin,
          unit: item.unit, gtin: item.gtin, withoutGtin: item.withoutGtin
        }, rules);
        return { ...item, cfop: resolved.cfop, csosn: resolved.csosn, cst: resolved.cstIcms, fiscalRuleId: resolved.ruleId, fiscalRuleVersion: resolved.ruleVersion, taxParameters: resolved.taxParameters };
      })
    };

    if (documentModel === '55') {
      const document = digitsOnly(resolvedSale.customerDocument);
      const destination = resolvedSale.destinationAddress;
      if (document.length !== 11 && document.length !== 14) throw new Error('Informe CPF ou CNPJ válido do destinatário para emitir NF-e.');
      if (!resolvedSale.customerName?.trim()) throw new Error('Informe o nome ou razão social do destinatário para emitir NF-e.');
      if (!destination?.street?.trim() || !destination.number?.trim() || !destination.neighborhood?.trim()
          || !destination.city?.trim() || !destination.state?.trim() || digitsOnly(destination.postalCode).length !== 8) {
        throw new Error('Informe o endereço completo do destinatário para emitir NF-e.');
      }
      if (resolvedSale.taxpayerIndicator === 'contributor' && !resolvedSale.customerStateRegistration?.trim()) {
        throw new Error('Informe a Inscrição Estadual do destinatário contribuinte.');
      }
    }

    return resolvedSale;
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

  private async claimOperation(orderId: string, provider: string, environment: string, model: '55' | '65') {
    const documentType = model === '55' ? 'NFE' : 'NFCE';
    const existing = await this.db
      .from('fiscal_operations')
      .select('*')
      .eq('sale_id', orderId)
      .eq('operation_type', 'issue')
      .eq('document_type', documentType)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.data) return existing.data;

    const { data, error } = await this.db
      .from('fiscal_operations')
      .insert({
        sale_id: orderId,
        operation_type: 'issue',
        document_type: documentType,
        reference: `tecnomotos-${documentType.toLowerCase()}-${orderId}`,
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
        .eq('document_type', documentType)
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
      document_type: sale.documentModel === '55' ? 'NFE' : 'NFCE',
      model: sale.documentModel || '65',
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
    await this.saveDocumentItems(data.id, sale);
    return data;
  }

  private async saveDocumentItems(documentId: string, sale: FiscalSale) {
    const rows = sale.items.map((item, index) => ({
      fiscal_document_id: documentId, order_item_id: item.id, product_id: item.productId || null,
      fiscal_rule_id: item.fiscalRuleId, rule_version: item.fiscalRuleVersion,
      item_number: index + 1, product_snapshot: { id: item.productId, sku: item.sku, name: item.name, ncm: item.ncm, cest: item.cest, origin: item.origin, unit: item.unit, gtin: item.gtin },
      fiscal_snapshot: { cfop: item.cfop, csosn: item.csosn, cstIcms: item.cst, taxParameters: item.taxParameters },
      quantity: item.quantity, unit_price: item.unitPrice, total_amount: Number((item.quantity * item.unitPrice).toFixed(2)),
      cfop: item.cfop, csosn: item.csosn || null, cst_icms: item.cst || null
    }));
    const { error } = await this.db.from('fiscal_document_items').upsert(rows, { onConflict: 'fiscal_document_id,item_number' });
    if (error) throw error;
  }

  private async saveFiscalPreview(orderId: string, sale: FiscalSale) {
    const contextSnapshot = {
      destinationUf: sale.destinationUf, taxpayerIndicator: sale.taxpayerIndicator,
      purchasePurpose: sale.purchasePurpose, documentModel: sale.documentModel,
      totalAmount: sale.totalAmount, items: sale.items.map((item) => ({
        id: item.id, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice,
        ncm: item.ncm, origin: item.origin, unit: item.unit, fiscalRuleId: item.fiscalRuleId, fiscalRuleVersion: item.fiscalRuleVersion
      }))
    };
    const contextHash = createHash('sha256').update(JSON.stringify(contextSnapshot)).digest('hex');
    const { data: current } = await this.db.from('fiscal_previews').select('id,context_hash').eq('sale_id', orderId).eq('status', 'ready');
    const same = (current || []).find((preview: any) => preview.context_hash === contextHash);
    if (same) return same;
    if (current?.length) {
      await this.db.from('fiscal_previews').update({ status: 'invalidated', invalidated_at: new Date().toISOString() }).eq('sale_id', orderId).eq('status', 'ready');
    }
    const { data, error } = await this.db.from('fiscal_previews').insert({
      sale_id: orderId, context_hash: contextHash, document_model: sale.documentModel,
      context_snapshot: contextSnapshot,
      rules_snapshot: sale.items.map((item) => ({ itemId: item.id, ruleId: item.fiscalRuleId, ruleVersion: item.fiscalRuleVersion, cfop: item.cfop, csosn: item.csosn, cstIcms: item.cst }))
    }).select().single();
    if (error) throw error;
    await this.db.from('orders').update({ fiscal_preview_hash: contextHash, fiscal_previewed_at: new Date().toISOString() }).eq('id', orderId);
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

  private canApplyWebhookStatus(current: string, incoming: FiscalDocumentStatus) {
    if (current === 'cancelled' || current === 'CANCELLED') return incoming === 'cancelled';
    if (current === 'authorized' || current === 'EMITTED') return incoming === 'authorized' || incoming === 'cancelled' || incoming === 'rejected';
    return true;
  }
}
