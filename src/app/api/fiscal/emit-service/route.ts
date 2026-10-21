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
      return NextResponse.json({ error: 'Acesso negado: sem permissão para emitir notas fiscais.' }, { status: 403 });
    }

    const { serviceOrderId } = await request.json();
    if (!serviceOrderId) {
      return NextResponse.json({ error: 'Ordem de serviço obrigatória para emissão da NFS-e.' }, { status: 400 });
    }

    const fiscalService = new FiscalOperationService(createAdminClient());
    const result = await fiscalService.issueNfse(serviceOrderId);

    return NextResponse.json({
      success: true,
      reused: result.reused,
      document: result.document
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao processar emissão da NFS-e.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
