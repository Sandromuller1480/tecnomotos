'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Building2, Check, CopyPlus, FileCheck2, ListChecks, MonitorCheck, PackageSearch, Pencil, Plus, Power } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Tab = 'company' | 'profiles' | 'rules' | 'pending' | 'monitoring';
type FiscalStatus = 'draft' | 'approved' | 'inactive';
type Row = Record<string, unknown>;
type Profile = Row & { id: string; name: string; code: string | null; version: number; status: FiscalStatus; source: string | null; valid_from: string | null; valid_to: string | null; notes: string | null };
type Rule = Row & { id: string; name: string; version: number; status: FiscalStatus; company_crt: string; fiscal_profile_id: string; document_model: '55' | '65'; origin_scope: 'internal' | 'interstate'; destination_scope: 'internal' | 'interstate'; destination_uf: string | null; taxpayer_indicator: 'contributor' | 'exempt' | 'non_contributor' | 'any'; purchase_purpose: 'resale' | 'final_consumption' | 'any'; cfop: string; csosn: string | null; cst_icms: string | null; tax_parameters: Record<string, unknown>; source: string | null; valid_from: string; valid_to: string | null };
type Product = Row & { id: string; sku: string; name: string; ncm: string | null; cest: string | null; fiscal_origin: number | null; unit: string | null; gtin: string | null; without_gtin: boolean; fiscal_status: 'pending' | 'review_required' | 'complete'; fiscal_review_notes: string | null; fiscal_tax_profile_id: string | null };

interface ProfileForm { id: string | null; name: string; code: string; source: string; validFrom: string; validTo: string; notes: string }
interface RuleForm { id: string | null; name: string; companyCrt: string; fiscalProfileId: string; documentModel: '55' | '65'; originScope: 'internal' | 'interstate'; destinationScope: 'internal' | 'interstate'; destinationUf: string; taxpayerIndicator: 'contributor' | 'exempt' | 'non_contributor' | 'any'; purchasePurpose: 'resale' | 'final_consumption' | 'any'; cfop: string; taxCodeType: 'csosn' | 'cst'; taxCode: string; taxParameters: string; source: string; validFrom: string; validTo: string }
interface ProductForm { id: string; name: string; sku: string; profileId: string; ncm: string; cest: string; origin: string; unit: string; gtin: string; withoutGtin: boolean; source: string; notes: string }

const today = () => new Date().toISOString().slice(0, 10);
const emptyProfile = (): ProfileForm => ({ id: null, name: '', code: '', source: '', validFrom: today(), validTo: '', notes: '' });
const emptyRule = (crt: string): RuleForm => ({ id: null, name: '', companyCrt: crt, fiscalProfileId: '', documentModel: '65', originScope: 'internal', destinationScope: 'internal', destinationUf: '', taxpayerIndicator: 'non_contributor', purchasePurpose: 'final_consumption', cfop: '', taxCodeType: crt === '1' ? 'csosn' : 'cst', taxCode: '', taxParameters: '{}', source: '', validFrom: today(), validTo: '' });
const tabs: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'company', label: 'Empresa', icon: Building2 }, { id: 'profiles', label: 'Perfis fiscais', icon: FileCheck2 },
  { id: 'rules', label: 'Regras de operação', icon: ListChecks }, { id: 'pending', label: 'Produtos pendentes', icon: PackageSearch },
  { id: 'monitoring', label: 'Homologação', icon: MonitorCheck }
];
const scopes = [{ value: 'internal', label: 'Interna' }, { value: 'interstate', label: 'Interestadual' }];
const originOptions = [
  { value: '', label: 'Selecione conforme a nota de compra' },
  { value: '0', label: '0 - Nacional' },
  { value: '1', label: '1 - Estrangeira: importação direta' },
  { value: '2', label: '2 - Estrangeira: adquirida no mercado interno' },
  { value: '3', label: '3 - Nacional, conteúdo importado superior a 40%' },
  { value: '4', label: '4 - Nacional, produção conforme processos básicos' },
  { value: '5', label: '5 - Nacional, conteúdo importado de até 40%' },
  { value: '6', label: '6 - Importação direta, sem similar nacional' },
  { value: '7', label: '7 - Estrangeira no mercado interno, sem similar nacional' },
  { value: '8', label: '8 - Nacional, conteúdo importado superior a 70%' }
];

export function FiscalSettingsDashboard({ initialTab = 'company', targetProductId }: { initialTab?: Tab; targetProductId?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [active, setActive] = useState<Tab>(targetProductId ? 'pending' : initialTab);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [documents, setDocuments] = useState<Row[]>([]);
  const [companyCrt, setCompanyCrt] = useState('1');
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleForm | null>(null);
  const [productForm, setProductForm] = useState<ProductForm | null>(null);
  const targetOpened = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all([
      supabase.from('fiscal_tax_profiles').select('*').order('updated_at', { ascending: false }),
      supabase.from('fiscal_rules').select('*').order('updated_at', { ascending: false }),
      supabase.from('products').select('id,sku,name,ncm,cest,fiscal_origin,unit,gtin,without_gtin,fiscal_status,fiscal_review_notes,fiscal_tax_profile_id').neq('fiscal_status', 'complete').order('updated_at', { ascending: false }),
      supabase.from('fiscal_documents').select('id,reference,document_type,environment,status').order('updated_at', { ascending: false }).limit(30),
      supabase.from('fiscal_settings').select('crt').limit(1).maybeSingle(), supabase.auth.getUser()
    ]);
    const failed = results.slice(0, 4).find((result) => result.error)?.error;
    if (failed) setError(failed.message);
    setProfiles((results[0].data || []) as Profile[]); setRules((results[1].data || []) as Rule[]);
    const loadedProducts = (results[2].data || []) as Product[];
    setProducts(loadedProducts); setDocuments((results[3].data || []) as Row[]);
    if (targetProductId && !targetOpened.current) {
      const target = loadedProducts.find((item) => item.id === targetProductId);
      if (target) setProductForm(productToForm(target));
      targetOpened.current = true;
    }
    setCompanyCrt(results[4].data?.crt || '1');
    const user = results[5].data.user;
    if (user) { const owner = await supabase.rpc('is_owner', { user_uuid: user.id }); setIsOwner(Boolean(owner.data)); }
    setLoading(false);
  }, [supabase, targetProductId]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const act = async (request: PromiseLike<{ error: { message: string } | null }>, success: string) => {
    setSaving(true); setError(''); setMessage('');
    const result = await request;
    if (result.error) setError(result.error.message); else { setMessage(success); await load(); }
    setSaving(false); return !result.error;
  };

  const saveProfile = async () => {
    if (!profileForm) return;
    const ok = await act(supabase.rpc('save_fiscal_profile_draft', { p_id: profileForm.id, p_name: profileForm.name, p_code: profileForm.code, p_source: profileForm.source, p_valid_from: profileForm.validFrom, p_valid_to: profileForm.validTo || null, p_notes: profileForm.notes || null }), 'Rascunho do perfil salvo.');
    if (ok) setProfileForm(null);
  };
  const saveRule = async () => {
    if (!ruleForm) return;
    let parameters: Record<string, unknown>;
    try { parameters = JSON.parse(ruleForm.taxParameters || '{}') as Record<string, unknown>; } catch { setError('Os parâmetros tributários devem formar um JSON válido.'); return; }
    const ok = await act(supabase.rpc('save_fiscal_rule_draft', { p_id: ruleForm.id, p_name: ruleForm.name, p_company_crt: ruleForm.companyCrt, p_fiscal_profile_id: ruleForm.fiscalProfileId, p_document_model: ruleForm.documentModel, p_origin_scope: ruleForm.originScope, p_destination_scope: ruleForm.destinationScope, p_destination_uf: ruleForm.destinationUf || null, p_taxpayer_indicator: ruleForm.taxpayerIndicator, p_purchase_purpose: ruleForm.purchasePurpose, p_cfop: ruleForm.cfop, p_csosn: ruleForm.taxCodeType === 'csosn' ? ruleForm.taxCode : null, p_cst_icms: ruleForm.taxCodeType === 'cst' ? ruleForm.taxCode : null, p_tax_parameters: parameters, p_source: ruleForm.source, p_valid_from: ruleForm.validFrom, p_valid_to: ruleForm.validTo || null }), 'Rascunho da regra salvo.');
    if (ok) setRuleForm(null);
  };
  const saveProduct = async () => {
    if (!productForm) return;
    const ok = await act(supabase.rpc('classify_product_fiscal', { p_product_id: productForm.id, p_profile_id: productForm.profileId, p_ncm: productForm.ncm, p_cest: productForm.cest || null, p_fiscal_origin: Number(productForm.origin), p_unit: productForm.unit, p_gtin: productForm.withoutGtin ? null : productForm.gtin, p_without_gtin: productForm.withoutGtin, p_source: productForm.source, p_review_notes: productForm.notes || null }), 'Produto classificado e status recalculado.');
    if (ok) setProductForm(null);
  };
  const approve = async (kind: 'profile' | 'rule', id: string) => {
    if (!confirm('Confirma a aprovação? O registro ficará imutável e mudanças futuras exigirão uma nova versão.')) return;
    await act(supabase.rpc(kind === 'profile' ? 'approve_fiscal_profile' : 'approve_fiscal_rule', { p_id: id }), kind === 'profile' ? 'Perfil aprovado.' : 'Regra aprovada.');
  };
  const deactivate = async (kind: 'profile' | 'rule', id: string) => {
    if (!confirm('Confirma a inativação deste registro?')) return;
    await act(supabase.rpc(kind === 'profile' ? 'deactivate_fiscal_profile' : 'deactivate_fiscal_rule', { p_id: id }), kind === 'profile' ? 'Perfil inativado.' : 'Regra inativada.');
  };

  return <div className="space-y-6 text-left">
    <div><Breadcrumb items={[{ label: 'Configurações' }, { label: 'Fiscal' }]} /><h1 className="mt-2 text-2xl font-black italic uppercase text-white">Configurações fiscais</h1><p className="mt-1 text-xs font-mono uppercase tracking-widest text-brand-grey">Perfis, regras, pendências e monitoramento da homologação</p></div>
    <div className="flex flex-wrap gap-2 border-b border-brand-grey/15 pb-4" role="tablist">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={active === id} onClick={() => setActive(id)} className={`flex items-center gap-2 border px-3 py-2 text-xs font-bold uppercase ${active === id ? 'border-brand-red bg-brand-red text-white' : 'border-brand-grey/20 text-brand-grey hover:text-white'}`}><Icon className="h-4 w-4" />{label}</button>)}</div>
    {error && <Notice danger>{error}</Notice>}{message && <Notice>{message}</Notice>}
    {!loading && !isOwner && <Notice>Modo de consulta: somente o proprietário pode alterar ou aprovar configurações fiscais.</Notice>}

    {active === 'company' && <Card className="space-y-4"><h2 className="font-bold uppercase text-white">Empresa e regime efetivo</h2><p className="text-sm text-brand-grey">Confirme CNPJ, IE, CRT, séries e ambiente antes de preparar documentos.</p><Link href="/admin/fiscal/configuracoes"><Button>Revisar dados da empresa</Button></Link></Card>}
    {active === 'profiles' && <Card className="space-y-4"><Header title="Perfis fiscais" note="O perfil agrupa produtos com o mesmo tratamento tributário. Use somente informações confirmadas pelo contador." count={profiles.length} action={isOwner ? <Button size="sm" onClick={() => setProfileForm(emptyProfile())}><Plus className="h-4 w-4" />Novo perfil</Button> : null} />
      {!profiles.some((profile) => profile.status === 'approved') && <Notice>Nenhum perfil está aprovado. Crie um perfil ou revise um rascunho abaixo e clique em “Aprovar”. Só depois será possível classificar produtos.</Notice>}
      <Table><TableHeader><TableRow><TableHead>Código / nome</TableHead><TableHead>Versão</TableHead><TableHead>Status</TableHead><TableHead>Vigência</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{profiles.length ? profiles.map((profile) => <TableRow key={profile.id}><TableCell><b className="text-white">{profile.code || 'Sem código'}</b><p className="text-xs text-brand-grey">{profile.name}</p></TableCell><TableCell>v{profile.version}</TableCell><TableCell><Status value={profile.status} /></TableCell><TableCell>{profile.valid_from || '—'} a {profile.valid_to || 'aberta'}</TableCell><TableCell><div className="flex flex-wrap gap-2">{isOwner && profile.status === 'draft' && <><Button size="sm" variant="secondary" onClick={() => setProfileForm(profileToForm(profile))}>Revisar</Button><Button size="sm" onClick={() => approve('profile', profile.id)}>Aprovar</Button></>}{isOwner && profile.status === 'approved' && <Button size="sm" variant="secondary" onClick={() => setProfileForm({ ...profileToForm(profile), id: null })}>Nova versão</Button>}{isOwner && profile.status !== 'inactive' && <Button size="sm" variant="ghost" onClick={() => deactivate('profile', profile.id)}>Inativar</Button>}</div></TableCell></TableRow>) : <Empty columns={5} />}</TableBody></Table>
    </Card>}
    {active === 'rules' && <Card className="space-y-4"><Header title="Regras de operação" note="Somente uma regra aprovada e vigente pode corresponder a cada emissão." count={rules.length} action={isOwner ? <Button size="sm" disabled={!profiles.some((p) => p.status === 'approved')} onClick={() => setRuleForm(emptyRule(companyCrt))}><Plus className="h-4 w-4" />Nova regra</Button> : null} />
      {!rules.some((rule) => rule.status === 'approved') && <Notice>O produto pode estar com os dados completos e mesmo assim a emissão permanecer bloqueada. Falta cadastrar e aprovar aqui a regra que define CFOP e CSOSN/CST para o tipo de venda.</Notice>}
      <Table><TableHeader><TableRow><TableHead>Regra</TableHead><TableHead>Perfil</TableHead><TableHead>Modelo / destino</TableHead><TableHead>CFOP / ICMS</TableHead><TableHead>Status</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{rules.length ? rules.map((rule) => <TableRow key={rule.id}><TableCell><b className="text-white">{rule.name}</b><p className="text-xs text-brand-grey">v{rule.version}</p></TableCell><TableCell>{profiles.find((p) => p.id === rule.fiscal_profile_id)?.code || 'Perfil indisponível'}</TableCell><TableCell>{rule.document_model} · {rule.destination_scope}{rule.destination_uf ? ` · ${rule.destination_uf}` : ''}</TableCell><TableCell>{rule.cfop} / {rule.csosn || rule.cst_icms}</TableCell><TableCell><Status value={rule.status} /></TableCell><TableCell><div className="flex gap-2">{isOwner && rule.status === 'draft' && <><Icon label="Editar" onClick={() => setRuleForm(ruleToForm(rule))}><Pencil /></Icon><Icon label="Aprovar" onClick={() => approve('rule', rule.id)}><Check /></Icon></>}{isOwner && rule.status === 'approved' && <Icon label="Nova versão" onClick={() => setRuleForm({ ...ruleToForm(rule), id: null })}><CopyPlus /></Icon>}{isOwner && rule.status !== 'inactive' && <Icon danger label="Inativar" onClick={() => deactivate('rule', rule.id)}><Power /></Icon>}</div></TableCell></TableRow>) : <Empty columns={6} />}</TableBody></Table>
    </Card>}
    {active === 'pending' && <Card className="space-y-4"><Header title="Produtos pendentes" note="Siga as etapas na ordem: primeiro aprove um perfil; depois complete a classificação do produto." count={products.length} />
      {!profiles.some((profile) => profile.status === 'approved') && <div className="flex flex-wrap items-center justify-between gap-3 border border-amber-500/35 bg-amber-500/5 p-4"><div><p className="font-bold text-amber-300">Etapa 1 de 2: falta um perfil fiscal aprovado</p><p className="mt-1 text-xs text-brand-silver">Sem esse perfil, a lista do modal fica vazia e nenhum produto pode ser liberado para nota fiscal.</p></div><Button size="sm" variant="secondary" onClick={() => setActive('profiles')}>Ir para perfis fiscais</Button></div>}
      <Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>Pendências</TableHead><TableHead>Perfil</TableHead><TableHead>Status</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{products.length ? products.map((product) => <TableRow key={product.id} className={targetProductId === product.id ? 'bg-brand-red/10' : ''}><TableCell>{product.sku || '—'}</TableCell><TableCell className="font-bold text-white">{product.name}</TableCell><TableCell><div className="flex flex-wrap gap-1">{missingFields(product).map((field) => <Badge key={field} variant="warning">{field}</Badge>)}</div></TableCell><TableCell>{profiles.find((p) => p.id === product.fiscal_tax_profile_id)?.code || 'Não vinculado'}</TableCell><TableCell><Status value={product.fiscal_status} /></TableCell><TableCell>{isOwner && <Button size="sm" variant="secondary" onClick={() => setProductForm(productToForm(product))}><Pencil className="h-4 w-4" />Classificar</Button>}</TableCell></TableRow>) : <Empty columns={6} message="Nenhuma pendência fiscal." />}</TableBody></Table>
    </Card>}
    {active === 'monitoring' && <Card className="space-y-4"><Header title="Monitoramento da homologação" note="Processamento não equivale à autorização da SEFAZ." count={documents.length} /><SimpleTable headers={['Referência', 'Modelo', 'Ambiente', 'Status']} rows={documents.map((d) => [String(d.reference || d.id), String(d.document_type), String(d.environment), <Status key="s" value={String(d.status)} />])} /></Card>}

    <ProfileEditor form={profileForm} saving={saving} setForm={setProfileForm} save={saveProfile} />
    <RuleEditor form={ruleForm} profiles={profiles.filter((p) => p.status === 'approved')} saving={saving} setForm={setRuleForm} save={saveRule} />
    <ProductEditor form={productForm} profiles={profiles.filter((p) => p.status === 'approved')} saving={saving} setForm={setProductForm} save={saveProduct} openProfiles={() => { setProductForm(null); setActive('profiles'); }} />
  </div>;
}

function ProfileEditor({ form, saving, setForm, save }: { form: ProfileForm | null; saving: boolean; setForm: (v: ProfileForm | null) => void; save: () => void }) {
  if (!form) return null; const set = (key: keyof ProfileForm, value: string) => setForm({ ...form, [key]: value });
  return <Modal isOpen onClose={() => setForm(null)} title={form.id ? 'Editar perfil fiscal' : 'Novo perfil fiscal'} size="lg" footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button><Button disabled={saving} onClick={save}>Salvar rascunho</Button></>}><div className="grid gap-4 md:grid-cols-2"><Input label="Nome" value={form.name} onChange={(e) => set('name', e.target.value)} /><Input label="Código" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} /><Input label="Válido a partir de" type="date" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} /><Input label="Válido até (opcional)" type="date" value={form.validTo} onChange={(e) => set('validTo', e.target.value)} /><Input label="Fonte contábil" className="md:col-span-2" value={form.source} onChange={(e) => set('source', e.target.value)} /><Area label="Observações" value={form.notes} onChange={(value) => set('notes', value)} /></div></Modal>;
}

function RuleEditor({ form, profiles, saving, setForm, save }: { form: RuleForm | null; profiles: Profile[]; saving: boolean; setForm: (v: RuleForm | null) => void; save: () => void }) {
  if (!form) return null; const set = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) => setForm({ ...form, [key]: value });
  return <Modal isOpen onClose={() => setForm(null)} title={form.id ? 'Editar regra fiscal' : 'Nova regra fiscal'} size="xl" footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button><Button disabled={saving} onClick={save}>Salvar rascunho</Button></>}><div className="grid gap-4 md:grid-cols-3">
    <Input label="Nome da regra" className="md:col-span-2" value={form.name} onChange={(e) => set('name', e.target.value)} /><Input label="CRT" value={form.companyCrt} onChange={(e) => set('companyCrt', e.target.value.replace(/\D/g, '').slice(0, 1))} />
    <Select label="Perfil aprovado" value={form.fiscalProfileId} options={[{ value: '', label: 'Selecione' }, ...profiles.map((p) => ({ value: p.id, label: `${p.code} · v${p.version}` }))]} onChange={(e) => set('fiscalProfileId', e.target.value)} /><Select label="Modelo" value={form.documentModel} options={[{ value: '65', label: '65 - NFC-e' }, { value: '55', label: '55 - NF-e' }]} onChange={(e) => set('documentModel', e.target.value as RuleForm['documentModel'])} />
    <Select label="Origem" value={form.originScope} options={scopes} onChange={(e) => set('originScope', e.target.value as RuleForm['originScope'])} /><Select label="Destino" value={form.destinationScope} options={scopes} onChange={(e) => set('destinationScope', e.target.value as RuleForm['destinationScope'])} /><Input label="UF específica (opcional)" maxLength={2} value={form.destinationUf} onChange={(e) => set('destinationUf', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
    <Select label="Destinatário" value={form.taxpayerIndicator} options={[{ value: 'non_contributor', label: 'Não contribuinte' }, { value: 'contributor', label: 'Contribuinte' }, { value: 'exempt', label: 'Isento' }, { value: 'any', label: 'Qualquer' }]} onChange={(e) => set('taxpayerIndicator', e.target.value as RuleForm['taxpayerIndicator'])} /><Select label="Finalidade" value={form.purchasePurpose} options={[{ value: 'final_consumption', label: 'Consumo final' }, { value: 'resale', label: 'Revenda' }, { value: 'any', label: 'Qualquer' }]} onChange={(e) => set('purchasePurpose', e.target.value as RuleForm['purchasePurpose'])} />
    <Input label="CFOP" maxLength={4} value={form.cfop} onChange={(e) => set('cfop', e.target.value.replace(/\D/g, ''))} /><Select label="Código ICMS" value={form.taxCodeType} options={[{ value: 'csosn', label: 'CSOSN' }, { value: 'cst', label: 'CST ICMS' }]} onChange={(e) => set('taxCodeType', e.target.value as RuleForm['taxCodeType'])} /><Input label={form.taxCodeType === 'csosn' ? 'CSOSN' : 'CST ICMS'} maxLength={form.taxCodeType === 'csosn' ? 3 : 2} value={form.taxCode} onChange={(e) => set('taxCode', e.target.value.replace(/\D/g, ''))} />
    <Input label="Válida a partir de" type="date" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} /><Input label="Válida até" type="date" value={form.validTo} onChange={(e) => set('validTo', e.target.value)} /><Input label="Fonte contábil" value={form.source} onChange={(e) => set('source', e.target.value)} /><Area label="Parâmetros tributários (JSON)" value={form.taxParameters} onChange={(value) => set('taxParameters', value)} />
  </div></Modal>;
}

function ProductEditor({ form, profiles, saving, setForm, save, openProfiles }: { form: ProductForm | null; profiles: Profile[]; saving: boolean; setForm: (v: ProductForm | null) => void; save: () => void; openProfiles: () => void }) {
  if (!form) return null; const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setForm({ ...form, [key]: value });
  const ready = Boolean(profiles.length && form.profileId && /^\d{8}$/.test(form.ncm) && form.origin !== '' && form.unit && form.source.trim().length >= 3);
  return <Modal isOpen onClose={() => setForm(null)} title={`Preparar ${form.name} para nota fiscal`} size="xl" footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button><Button disabled={saving || !ready} onClick={save}>Salvar e liberar produto</Button></>}><div className="grid gap-4 md:grid-cols-2"><p className="md:col-span-2 border border-brand-grey/15 p-3 text-xs"><b className="text-white">SKU {form.sku || 'não informado'}:</b> usado somente para identificar o item e não interfere na emissão.</p>
    {!profiles.length && <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 border border-amber-500/35 bg-amber-500/5 p-4"><div><p className="font-bold text-amber-300">Antes de continuar, aprove um perfil fiscal</p><p className="mt-1 text-xs text-brand-silver">A lista está vazia porque ainda não há perfil aprovado.</p></div><Button size="sm" variant="secondary" onClick={openProfiles}>Criar ou aprovar perfil</Button></div>}
    <Select label="Perfil fiscal aprovado" disabled={!profiles.length} value={form.profileId} options={[{ value: '', label: profiles.length ? 'Selecione o tratamento fiscal' : 'Nenhum perfil aprovado' }, ...profiles.map((p) => ({ value: p.id, label: `${p.name} · v${p.version}` }))]} onChange={(e) => set('profileId', e.target.value)} /><Input label="Fonte da informação" value={form.source} onChange={(e) => set('source', e.target.value)} /><Input label="NCM" maxLength={8} value={form.ncm} onChange={(e) => set('ncm', e.target.value.replace(/\D/g, ''))} /><Input label="CEST (somente quando aplicável)" maxLength={7} value={form.cest} onChange={(e) => set('cest', e.target.value.replace(/\D/g, ''))} />
    <div><Select label="Origem da mercadoria" value={form.origin} options={originOptions} onChange={(e) => set('origin', e.target.value)} /><p className="mt-1 text-[10px] leading-relaxed text-brand-grey">Copie a origem da nota fiscal de compra ou confirme com o contador. Não escolha pelo país da marca nem por suposição.</p></div><Select label="Unidade comercial" value={form.unit} options={['UN', 'PAR', 'KIT', 'L', 'KG', 'M', 'CX'].map((v) => ({ value: v, label: v }))} onChange={(e) => set('unit', e.target.value)} /><div className="space-y-2 md:col-span-2"><Input label="GTIN / código de barras" disabled={form.withoutGtin} maxLength={14} value={form.gtin} onChange={(e) => set('gtin', e.target.value.replace(/\D/g, ''))} /><label className="flex gap-2 text-xs text-white"><input type="checkbox" checked={form.withoutGtin} onChange={(e) => set('withoutGtin', e.target.checked)} />Este produto não possui GTIN</label></div><Area label="Observações (opcional)" value={form.notes} onChange={(value) => set('notes', value)} />
  </div></Modal>;
}

function profileToForm(p: Profile): ProfileForm { return { id: p.id, name: p.name, code: p.code || '', source: p.source || '', validFrom: p.valid_from || today(), validTo: p.valid_to || '', notes: p.notes || '' }; }
function ruleToForm(r: Rule): RuleForm { return { id: r.id, name: r.name, companyCrt: r.company_crt, fiscalProfileId: r.fiscal_profile_id, documentModel: r.document_model, originScope: r.origin_scope, destinationScope: r.destination_scope, destinationUf: r.destination_uf || '', taxpayerIndicator: r.taxpayer_indicator, purchasePurpose: r.purchase_purpose, cfop: r.cfop, taxCodeType: r.csosn ? 'csosn' : 'cst', taxCode: r.csosn || r.cst_icms || '', taxParameters: JSON.stringify(r.tax_parameters || {}, null, 2), source: r.source || '', validFrom: r.valid_from, validTo: r.valid_to || '' }; }
function productToForm(p: Product): ProductForm { return { id: p.id, name: p.name, sku: p.sku || '', profileId: p.fiscal_tax_profile_id || '', ncm: p.ncm || '', cest: p.cest || '', origin: p.fiscal_origin === null ? '' : String(p.fiscal_origin), unit: p.unit || 'UN', gtin: p.gtin || '', withoutGtin: Boolean(p.without_gtin), source: 'Revisão conforme orientação contábil', notes: p.fiscal_review_notes || '' }; }
function missingFields(p: Product) { const fields: string[] = []; if (!/^\d{8}$/.test(p.ncm || '')) fields.push('NCM'); if (p.fiscal_origin === null) fields.push('Origem'); if (!p.unit) fields.push('Unidade'); if (!p.without_gtin && !p.gtin) fields.push('GTIN/sem GTIN'); if (!p.fiscal_tax_profile_id) fields.push('Perfil'); return fields.length ? fields : ['Aprovação do perfil']; }
function Header({ title, note, count, action }: { title: string; note: string; count: number; action?: React.ReactNode }) { return <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold uppercase text-white">{title}</h2><p className="text-xs text-brand-grey">{note}</p></div><div className="flex items-center gap-3"><Badge variant="neutral">{count}</Badge>{action}</div></div>; }
function Status({ value }: { value: string }) { const labels: Record<string, string> = { approved: 'Aprovado', complete: 'Completo', draft: 'Rascunho', pending: 'Pendente', review_required: 'Revisar', inactive: 'Inativo', authorized: 'Autorizado', processing: 'Processando' }; return <Badge variant={['approved', 'complete', 'authorized'].includes(value) ? 'success' : ['draft', 'pending', 'review_required', 'processing'].includes(value) ? 'warning' : 'neutral'}>{labels[value] || value}</Badge>; }
function Notice({ children, danger }: { children: React.ReactNode; danger?: boolean }) { return <Card className={`flex items-center gap-2 ${danger ? 'border-brand-red/40 text-red-300' : 'border-amber-500/30 text-amber-300'}`}><AlertTriangle className="h-4 w-4" />{children}</Card>; }
function Icon({ label, children, danger, onClick }: { label: string; children: React.ReactElement<{ className?: string }>; danger?: boolean; onClick: () => void }) { return <button type="button" title={label} aria-label={label} onClick={onClick} className={`border p-2 ${danger ? 'border-brand-red/50 text-brand-red' : 'border-brand-grey/20 text-brand-grey hover:text-white'}`}>{React.cloneElement(children, { className: 'h-4 w-4' })}</button>; }
function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="md:col-span-3 text-xs font-bold uppercase tracking-widest text-brand-grey">{label}<textarea className="mt-1 min-h-20 w-full border border-brand-grey/20 bg-brand-darkgrey p-3 text-sm normal-case tracking-normal text-white" value={value} onChange={(e) => onChange(e.target.value)} /></label>; }
function Empty({ columns, message = 'Nenhum registro.' }: { columns: number; message?: string }) { return <TableRow><td colSpan={columns} className="px-4 py-8 text-center text-brand-grey">{message}</td></TableRow>; }
function SimpleTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) { return <Table><TableHeader><TableRow>{headers.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.length ? rows.map((row, i) => <TableRow key={i}>{row.map((cell, j) => <TableCell key={j}>{cell}</TableCell>)}</TableRow>) : <Empty columns={headers.length} />}</TableBody></Table>; }
