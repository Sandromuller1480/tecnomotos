import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type RulePayload = {
  id?: string | null;
  name?: string;
  companyCrt?: string;
  fiscalProfileId?: string;
  operationType?: 'sale' | 'purchase';
  documentModel?: '55' | '65';
  originScope?: 'internal' | 'interstate';
  destinationScope?: 'internal' | 'interstate';
  destinationUf?: string;
  taxpayerIndicator?: 'contributor' | 'exempt' | 'non_contributor' | 'any';
  purchasePurpose?: 'resale' | 'final_consumption' | 'any';
  cfop?: string;
  taxCodeType?: 'csosn' | 'cst';
  taxCode?: string;
  taxParameters?: Record<string, unknown>;
  source?: string;
  validFrom?: string;
  validTo?: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const { data: isOwner, error: ownerError } = await supabase.rpc('is_owner', {
    user_uuid: user.id
  });
  if (ownerError || !isOwner) {
    return NextResponse.json({ error: 'Somente o proprietário pode salvar regras fiscais.' }, { status: 403 });
  }

  let payload: RulePayload;
  try {
    payload = await request.json() as RulePayload;
  } catch {
    return NextResponse.json({ error: 'Dados da regra fiscal inválidos.' }, { status: 400 });
  }

  const name = payload.name?.trim() || '';
  const source = payload.source?.trim() || '';
  const destinationUf = payload.destinationUf?.trim().toUpperCase() || null;
  const validTo = payload.validTo || null;
  const allowedOperation = payload.operationType === 'sale' || payload.operationType === 'purchase';
  const allowedScope = (value: unknown) => value === 'internal' || value === 'interstate';
  const allowedTaxpayer = ['contributor', 'exempt', 'non_contributor', 'any'].includes(payload.taxpayerIndicator || '');
  const allowedPurpose = ['resale', 'final_consumption', 'any'].includes(payload.purchasePurpose || '');
  const taxCodeValid = payload.taxCodeType === 'csosn'
    ? /^\d{3}$/.test(payload.taxCode || '')
    : payload.taxCodeType === 'cst' && /^\d{2}$/.test(payload.taxCode || '');

  if (name.length < 3 || source.length < 3 || !payload.fiscalProfileId || !allowedOperation
      || payload.documentModel !== '55' || !allowedScope(payload.originScope)
      || !allowedScope(payload.destinationScope) || !allowedTaxpayer || !allowedPurpose
      || !/^\d{4}$/.test(payload.cfop || '') || !taxCodeValid
      || !/^\d{4}-\d{2}-\d{2}$/.test(payload.validFrom || '')
      || (validTo && !/^\d{4}-\d{2}-\d{2}$/.test(validTo))
      || (destinationUf && !/^[A-Z]{2}$/.test(destinationUf))) {
    return NextResponse.json({ error: 'Revise os campos obrigatórios e os códigos da regra fiscal.' }, { status: 400 });
  }
  if (validTo && payload.validFrom && validTo < payload.validFrom) {
    return NextResponse.json({ error: 'A data final da vigência não pode ser anterior à data inicial.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('fiscal_tax_profiles')
    .select('id')
    .eq('id', payload.fiscalProfileId)
    .eq('status', 'approved')
    .maybeSingle();
  if (profileError || !profile) {
    return NextResponse.json({ error: 'Selecione um perfil fiscal aprovado.' }, { status: 400 });
  }

  const values = {
    name,
    company_crt: payload.companyCrt?.trim() || '',
    fiscal_profile_id: payload.fiscalProfileId,
    operation_type: payload.operationType,
    document_model: payload.documentModel,
    origin_scope: payload.originScope,
    destination_scope: payload.destinationScope,
    destination_uf: destinationUf,
    taxpayer_indicator: payload.taxpayerIndicator,
    purchase_purpose: payload.purchasePurpose,
    cfop: payload.cfop,
    csosn: payload.taxCodeType === 'csosn' ? payload.taxCode : null,
    cst_icms: payload.taxCodeType === 'cst' ? payload.taxCode : null,
    tax_parameters: payload.taxParameters || {},
    source,
    valid_from: payload.validFrom,
    valid_to: validTo
  };

  if (payload.id) {
    const { data, error } = await admin
      .from('fiscal_rules')
      .update(values)
      .eq('id', payload.id)
      .eq('status', 'draft')
      .select('id,name,version')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Regra em rascunho não encontrada.' }, { status: 404 });
    return NextResponse.json({ success: true, rule: data });
  }

  const { data: previous, error: versionError } = await admin
    .from('fiscal_rules')
    .select('version')
    .eq('name', name)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 });

  const { data, error } = await admin
    .from('fiscal_rules')
    .insert({
      ...values,
      version: (previous?.version || 0) + 1,
      status: 'draft',
      approved_by: null,
      approved_at: null
    })
    .select('id,name,version')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, rule: data }, { status: 201 });
}
