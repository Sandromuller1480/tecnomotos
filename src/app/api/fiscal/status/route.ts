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

    const { data: hasPerm } = await supabase.rpc('has_permission', {
      user_uuid: user.id,
      required_permission: 'fiscal.view'
    });

    if (!hasPerm) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const { documentId } = await request.json();
    if (!documentId) {
      return NextResponse.json({ error: 'Documento fiscal obrigatório.' }, { status: 400 });
    }

    const fiscalService = new FiscalOperationService(createAdminClient());
    const document = await fiscalService.queryDocument(documentId);

    return NextResponse.json({ success: true, document });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao consultar nota fiscal.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
