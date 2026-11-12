import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const { data: isOwner, error: ownerError } = await supabase.rpc('is_owner', {
    user_uuid: user.id
  });

  if (ownerError || !isOwner) {
    return NextResponse.json({ error: 'Somente o proprietário pode excluir regras fiscais.' }, { status: 403 });
  }

  const { id } = await params;
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('fiscal_rules')
    .delete()
    .eq('id', id)
    .select('id,name,version')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Regra fiscal não encontrada.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, rule: data });
}
