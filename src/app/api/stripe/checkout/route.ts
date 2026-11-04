import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StripePaymentService } from '@/lib/services/payment/StripePaymentService';
import { determineDocumentModel, FiscalRuleRecord, resolveFiscalItem } from '@/lib/fiscal/rules/engine';

interface CheckoutItemInput {
  id: string; // Product UUID
  quantity: number;
}

function toFiscalRule(rule: Record<string, unknown>): FiscalRuleRecord {
  return {
    id: String(rule.id), name: String(rule.name), version: Number(rule.version), status: rule.status as FiscalRuleRecord['status'],
    companyCrt: String(rule.company_crt), fiscalProfileId: String(rule.fiscal_profile_id), operationType: rule.operation_type as 'sale',
    documentModel: rule.document_model as FiscalRuleRecord['documentModel'], originScope: rule.origin_scope as FiscalRuleRecord['originScope'],
    destinationScope: rule.destination_scope as FiscalRuleRecord['destinationScope'], destinationUf: rule.destination_uf ? String(rule.destination_uf) : null,
    taxpayerIndicator: rule.taxpayer_indicator as FiscalRuleRecord['taxpayerIndicator'], purchasePurpose: rule.purchase_purpose as FiscalRuleRecord['purchasePurpose'],
    cfop: String(rule.cfop), csosn: rule.csosn ? String(rule.csosn) : null, cstIcms: rule.cst_icms ? String(rule.cst_icms) : null,
    taxParameters: (rule.tax_parameters || {}) as Record<string, unknown>, validFrom: String(rule.valid_from), validTo: rule.valid_to ? String(rule.valid_to) : null,
    approvedBy: rule.approved_by ? String(rule.approved_by) : null, approvedAt: rule.approved_at ? String(rule.approved_at) : null, source: rule.source ? String(rule.source) : null
  };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Get authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Você precisa estar logado para realizar compras.' }, { status: 401 });
    }

    const body = await request.json();
    const items: CheckoutItemInput[] = body.items || [];

    if (items.length === 0) {
      return NextResponse.json({ error: 'Seu carrinho está vazio.' }, { status: 400 });
    }

    const { data: customerId, error: customerIdError } = await supabase.rpc('current_customer_id');
    if (customerIdError || !customerId) {
      return NextResponse.json({ error: 'Sua conta não está vinculada a um cadastro de cliente.' }, { status: 403 });
    }

    const [{ data: customer }, { data: address }, { data: company }, { data: ruleRows, error: rulesError }] = await Promise.all([
      supabase.from('customers').select('document,icms_taxpayer_indicator,purchase_purpose').eq('id', customerId).maybeSingle(),
      supabase.from('customer_addresses').select('id,state').eq('customer_id', customerId).eq('is_default', true).maybeSingle(),
      supabase.from('fiscal_settings').select('crt,uf').limit(1).maybeSingle(),
      supabase.from('fiscal_rules').select('*').eq('status', 'approved')
    ]);
    if (rulesError) return NextResponse.json({ error: 'Não foi possível validar a cobertura fiscal deste destino.' }, { status: 503 });
    if (!address?.state) return NextResponse.json({ error: 'Informe um endereço de entrega fiscal antes de continuar.' }, { status: 400 });
    if (!customer?.icms_taxpayer_indicator) return NextResponse.json({ error: 'Confirme sua situação de contribuinte do ICMS antes de continuar.' }, { status: 400 });
    if (!customer?.purchase_purpose) return NextResponse.json({ error: 'Informe se a compra é para revenda ou consumo final antes de continuar.' }, { status: 400 });
    if (!company?.crt) return NextResponse.json({ error: 'O regime tributário da empresa ainda não foi confirmado.' }, { status: 503 });
    const destinationScope = address.state.toUpperCase() === (company.uf || 'MT').toUpperCase() ? 'internal' : 'interstate';
    const documentModel = determineDocumentModel({ destinationScope, nfceEligible: destinationScope === 'internal' && customer.icms_taxpayer_indicator === 'non_contributor' && customer.purchase_purpose === 'final_consumption' });
    const rules: FiscalRuleRecord[] = (ruleRows || []).map(toFiscalRule);

    // 2. Resolve origin for redirect URLs
    const origin = request.headers.get('origin') || 'http://localhost:3000';

    // 3. Recalculate totals and check stock from database
    let totalAmount = 0;
    const validatedItems = [];

    for (const item of items) {
      const { data: product, error: prodErr } = await supabase
        .from('products')
        .select('id, sku, name, price, stock_quantity, stripe_price_id, ncm, cest, fiscal_origin, unit, gtin, without_gtin, fiscal_status, fiscal_tax_profile_id')
        .eq('id', item.id)
        .single();

      if (prodErr || !product) {
        return NextResponse.json({ error: `Produto não encontrado: ${item.id}` }, { status: 400 });
      }

      // Check stock
      if ((product.stock_quantity || 0) < item.quantity) {
        return NextResponse.json({ 
          error: `Estoque insuficiente para o produto: ${product.name}. Disponível: ${product.stock_quantity || 0} un.` 
        }, { status: 400 });
      }

      try {
        resolveFiscalItem({
          companyCrt: company.crt, issuerUf: company.uf || 'MT', destinationUf: address.state.toUpperCase(),
          destinationScope, taxpayerIndicator: customer.icms_taxpayer_indicator, purchasePurpose: customer.purchase_purpose,
          operationType: 'sale', documentModel, occurredAt: new Date()
        }, {
          id: product.id, sku: product.sku, name: product.name, fiscalStatus: product.fiscal_status || 'pending',
          fiscalProfileId: product.fiscal_tax_profile_id, ncm: product.ncm, cest: product.cest,
          origin: product.fiscal_origin, unit: product.unit, gtin: product.gtin, withoutGtin: product.without_gtin
        }, rules);
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Destino sem cobertura fiscal aprovada.' }, { status: 422 });
      }

      const unitPrice = parseFloat(product.price) || 0;
      totalAmount += unitPrice * item.quantity;

      validatedItems.push({
        id: product.id,
        name: product.name,
        price: unitPrice,
        quantity: item.quantity
      });
    }

    // 4. Create the reserved order in the database (status = pending_payment)
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        customer_id: customerId,
        customer_email: user.email,
        status: 'pending_payment',
        total_amount: totalAmount
        ,delivery_mode: 'delivery'
        ,delivery_address_id: address.id
        ,purchase_purpose: customer.purchase_purpose
      })
      .select('id')
      .single();

    if (orderErr || !order) {
      throw new Error(`Falha ao registrar pedido no banco: ${orderErr?.message}`);
    }

    // 5. Insert order items
    const orderItemsPayload = validatedItems.map(item => ({
      order_id: order.id,
      product_id: item.id,
      quantity: item.quantity,
      unit_price: item.price
    }));

    const { error: itemsErr } = await supabase
      .from('order_items')
      .insert(orderItemsPayload);

    if (itemsErr) {
      // Cleanup order to prevent orphans
      await supabase.from('orders').delete().eq('id', order.id);
      throw new Error(`Falha ao registrar itens do pedido: ${itemsErr.message}`);
    }

    // 6. Create Stripe Checkout Session
    const paymentService = new StripePaymentService();
    const successUrl = `${origin}/checkout/sucesso?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/checkout/cancelado`;

    const session = await paymentService.createCheckoutSession(
      customerId,
      validatedItems,
      cancelUrl,
      successUrl,
      order.id
    );

    // Save checkout session ID to order
    await supabase
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', order.id);

    return NextResponse.json({ success: true, url: session.url });
  } catch (err: unknown) {
    console.error('[Checkout Route Error]:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro inesperado ao criar checkout.' }, { status: 500 });
  }
}
