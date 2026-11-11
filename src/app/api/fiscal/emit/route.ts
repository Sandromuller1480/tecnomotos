import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { FiscalOperationService } from '@/lib/services/fiscal/FiscalOperationService';
import { FiscalResolutionError } from '@/lib/fiscal/rules/engine';

function apiErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (!error || typeof error !== 'object') return 'Erro ao processar emissão fiscal';

  const source = error as Record<string, unknown>;
  const detail = [source.message, source.details, source.hint]
    .find((value) => typeof value === 'string' && value.trim());
  const code = typeof source.code === 'string' && source.code.trim() ? source.code.trim() : null;

  if (typeof detail === 'string') return code ? `${code}: ${detail}` : detail;
  return 'Erro ao processar emissão fiscal';
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { data: hasPerm, error: permError } = await supabase.rpc('has_permission', {
      user_uuid: user.id,
      required_permission: 'fiscal.create'
    });

    if (permError || !hasPerm) {
      return NextResponse.json({ error: 'Acesso negado: sem permissão para emitir notas fiscais' }, { status: 403 });
    }

    const body = await request.json();
    const { orderId, fiscalContext } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'Pedido obrigatório para emissão fiscal.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    if (!fiscalContext) {
      return NextResponse.json({ error: 'Confirme os dados do destinatario antes de emitir a NF-e.' }, { status: 400 });
    }

    if (fiscalContext) {
      const deliveryMode = fiscalContext.deliveryMode === 'delivery' ? 'delivery' : fiscalContext.deliveryMode === 'pickup' ? 'pickup' : null;
      const taxpayerIndicator = ['contributor', 'exempt', 'non_contributor'].includes(fiscalContext.taxpayerIndicator)
        ? fiscalContext.taxpayerIndicator
        : null;
      const purchasePurpose = ['resale', 'final_consumption'].includes(fiscalContext.purchasePurpose)
        ? fiscalContext.purchasePurpose
        : null;
      const freightMode = deliveryMode === 'pickup'
        ? 'none'
        : ['issuer', 'recipient', 'third_party', 'none'].includes(fiscalContext.freightMode)
          ? fiscalContext.freightMode
          : null;

      if (!deliveryMode || !taxpayerIndicator || !purchasePurpose || !freightMode) {
        return NextResponse.json({ error: 'Preencha destino, frete, situação de ICMS e finalidade da compra.' }, { status: 400 });
      }

      const { data: settings } = await adminClient.from('fiscal_settings').select('uf').limit(1).maybeSingle();
      const destinationUf = (deliveryMode === 'pickup'
        ? settings?.uf || process.env.FISCAL_UF || 'MT'
        : String(fiscalContext.destinationUf || '')).trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(destinationUf)) {
        return NextResponse.json({ error: 'Informe uma UF de destino válida.' }, { status: 400 });
      }

      const clean = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
      const digits = (value: unknown) => typeof value === 'string' ? value.replace(/\D/g, '') : '';
      const recipientDocument = digits(fiscalContext.recipientDocument);
      const postalCode = digits(fiscalContext.postalCode);
      if (!clean(fiscalContext.recipientName) || ![11, 14].includes(recipientDocument.length)) {
        return NextResponse.json({ error: 'Para NF-e, informe nome e CPF/CNPJ valido do destinatario.' }, { status: 400 });
      }
      if (!clean(fiscalContext.street) || !clean(fiscalContext.number) || !clean(fiscalContext.neighborhood)
          || !clean(fiscalContext.city) || postalCode.length !== 8) {
        return NextResponse.json({ error: 'Para NF-e, informe o endereco completo do destinatario.' }, { status: 400 });
      }
      if (taxpayerIndicator === 'contributor' && !clean(fiscalContext.stateRegistration)) {
        return NextResponse.json({ error: 'Informe a Inscricao Estadual do destinatario contribuinte.' }, { status: 400 });
      }
      const { error: contextError } = await adminClient
        .from('orders')
        .update({
          customer_name: clean(fiscalContext.recipientName),
          delivery_mode: deliveryMode,
          purchase_purpose: purchasePurpose,
          fiscal_taxpayer_indicator: taxpayerIndicator,
          fiscal_state_registration: clean(fiscalContext.stateRegistration),
          fiscal_recipient_document: recipientDocument,
          fiscal_freight_mode: freightMode,
          fiscal_destination_street: clean(fiscalContext.street),
          fiscal_destination_number: clean(fiscalContext.number),
          fiscal_destination_complement: clean(fiscalContext.complement),
          fiscal_destination_neighborhood: clean(fiscalContext.neighborhood),
          fiscal_destination_city: clean(fiscalContext.city),
          fiscal_destination_uf: destinationUf,
          fiscal_destination_postal_code: postalCode
        })
        .eq('id', orderId);

      if (contextError) throw contextError;
    }

    const fiscalService = new FiscalOperationService(adminClient);
    // Product tax codes and recipient context are loaded from the database.
    // Values sent by the browser are intentionally not fiscal authority.
    const result = await fiscalService.issueNfe(orderId);

    return NextResponse.json({
      success: true,
      reused: result.reused,
      document: result.document
    });
  } catch (e: unknown) {
    if (e instanceof FiscalResolutionError) {
      return NextResponse.json({ error: e.message, code: e.code, details: e.details }, { status: 422 });
    }
    const errMsg = apiErrorMessage(e);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
