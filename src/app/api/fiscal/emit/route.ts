import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { FiscalOperationService } from '@/lib/services/fiscal/FiscalOperationService';

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
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'Pedido obrigatório para emissão fiscal.' }, { status: 400 });
    }

    const fiscalService = new FiscalOperationService(createAdminClient());
    // Product tax codes and recipient context are loaded from the database.
    // Values sent by the browser are intentionally not fiscal authority.
    const result = await fiscalService.issueNfce(orderId);

    return NextResponse.json({
      success: true,
      reused: result.reused,
      document: result.document
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : 'Erro ao processar emissão fiscal';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
