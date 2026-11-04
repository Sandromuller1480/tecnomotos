'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Building2, FileCheck2, ListChecks, MonitorCheck, PackageSearch } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Tab = 'company' | 'profiles' | 'rules' | 'pending' | 'monitoring';
type Row = Record<string, string | number | null | undefined>;

const tabs: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'company', label: 'Empresa', icon: Building2 },
  { id: 'profiles', label: 'Perfis fiscais', icon: FileCheck2 },
  { id: 'rules', label: 'Regras de operação', icon: ListChecks },
  { id: 'pending', label: 'Produtos pendentes', icon: PackageSearch },
  { id: 'monitoring', label: 'Homologação', icon: MonitorCheck }
];

export function FiscalSettingsDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [active, setActive] = useState<Tab>('company');
  const [profiles, setProfiles] = useState<Row[]>([]);
  const [rules, setRules] = useState<Row[]>([]);
  const [pending, setPending] = useState<Row[]>([]);
  const [documents, setDocuments] = useState<Row[]>([]);
  const [loadError, setLoadError] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [classificationSource, setClassificationSource] = useState('Revisão administrativa');
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    Promise.all([
      supabase.from('fiscal_tax_profiles').select('*').order('updated_at', { ascending: false }),
      supabase.from('fiscal_rules').select('*').order('updated_at', { ascending: false }),
      supabase.from('products').select('id,sku,name,ncm,cest,fiscal_status,fiscal_tax_profile_id,updated_at').neq('fiscal_status', 'complete').order('updated_at', { ascending: false }),
      supabase.from('fiscal_documents').select('id,reference,document_type,environment,status,provider_status,updated_at').order('updated_at', { ascending: false }).limit(30)
    ]).then((results) => {
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) setLoadError(firstError.message);
      setProfiles(results[0].data || []); setRules(results[1].data || []); setPending(results[2].data || []); setDocuments(results[3].data || []);
    });
  }, [supabase]);

  const assignProfile = async () => {
    setActionMessage('');
    const { data, error } = await supabase.rpc('assign_fiscal_profile', {
      p_product_ids: selectedProducts, p_profile_id: selectedProfile, p_source: classificationSource
    });
    if (error) return setActionMessage(error.message);
    const { data: refreshed } = await supabase.from('products').select('id,sku,name,ncm,cest,fiscal_status,fiscal_tax_profile_id,updated_at').neq('fiscal_status', 'complete').order('updated_at', { ascending: false });
    setPending(refreshed || []); setSelectedProducts([]); setActionMessage(`${data} produto(s) vinculado(s).`);
  };

  return (
    <div className="space-y-6 text-left">
      <div><Breadcrumb items={[{ label: 'Configurações' }, { label: 'Fiscal' }]} /><h1 className="mt-2 text-2xl font-black italic uppercase text-white">Configurações fiscais</h1><p className="mt-1 text-xs font-mono uppercase tracking-widest text-brand-grey">Perfis, regras, pendências e monitoramento da homologação</p></div>
      <div className="flex flex-wrap gap-2 border-b border-brand-grey/15 pb-4" role="tablist" aria-label="Seções fiscais">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={active === id} onClick={() => setActive(id)} className={`flex items-center gap-2 border px-3 py-2 text-xs font-bold uppercase ${active === id ? 'border-brand-red bg-brand-red text-white' : 'border-brand-grey/20 text-brand-grey hover:text-white'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </div>
      {loadError && <Card className="flex items-center gap-2 border-amber-500/30 text-amber-400"><AlertTriangle className="h-4 w-4" /> Aplique a migration 026 para habilitar toda a área: {loadError}</Card>}
      {active === 'company' && <Card className="space-y-4"><h2 className="font-bold uppercase text-white">Empresa e regime efetivo</h2><p className="text-sm text-brand-grey">Confirme CNPJ, IE, CRT, séries e ambiente antes de preparar documentos. O ambiente de produção continua bloqueado por configuração do servidor.</p><Link href="/admin/fiscal/configuracoes"><Button>Revisar dados da empresa</Button></Link></Card>}
      {active === 'profiles' && <Card className="space-y-4"><Header title="Perfis fiscais" note="Perfis não atribuem um CFOP permanente ao produto." count={profiles.length} /><SimpleTable headers={['Código / nome', 'Versão', 'Status', 'Vigência']} rows={profiles.map((p) => [p.code || p.name, p.version, <Status key="s" value={String(p.status || '')} />, `${p.valid_from || '—'} a ${p.valid_to || 'aberta'}`])} /></Card>}
      {active === 'rules' && <Card className="space-y-4"><Header title="Regras de operação" note="Somente regras aprovadas, vigentes e com uma única correspondência podem emitir." count={rules.length} /><SimpleTable headers={['Regra', 'Modelo', 'Destino', 'CFOP / ICMS', 'Status']} rows={rules.map((r) => [r.name, r.document_model, `${r.destination_scope}${r.destination_uf ? ` · ${r.destination_uf}` : ''}`, `${r.cfop} / ${r.csosn || r.cst_icms}`, <Status key="s" value={String(r.status || '')} />])} /></Card>}
      {active === 'pending' && <Card className="space-y-4"><Header title="Produtos pendentes" note="Vincule somente classificações revisadas; NCM, CEST ou descrição não aprovam perfil por inferência." count={pending.length} />
        <div className="grid grid-cols-1 gap-3 border-y border-brand-grey/15 py-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="text-xs text-brand-grey">Perfil aprovado<select value={selectedProfile} onChange={(e) => setSelectedProfile(e.target.value)} className="mt-1 w-full border border-brand-grey/20 bg-brand-darkgrey p-2 text-white"><option value="">Selecione</option>{profiles.filter((p) => p.status === 'approved').map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.code || p.name)}</option>)}</select></label>
          <label className="text-xs text-brand-grey">Fonte da classificação<input value={classificationSource} onChange={(e) => setClassificationSource(e.target.value)} className="mt-1 w-full border border-brand-grey/20 bg-brand-darkgrey p-2 text-white" /></label>
          <Button disabled={!selectedProfile || !selectedProducts.length || classificationSource.trim().length < 3} onClick={assignProfile}>Vincular selecionados</Button>
        </div>
        {actionMessage && <p className="text-xs text-amber-400">{actionMessage}</p>}
        <Table><TableHeader><TableRow><TableHead>Selecionar</TableHead><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>NCM</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader><TableBody>{pending.map((p) => <TableRow key={String(p.id)}><TableCell><input type="checkbox" aria-label={`Selecionar ${String(p.name)}`} checked={selectedProducts.includes(String(p.id))} onChange={(e) => setSelectedProducts((current) => e.target.checked ? [...current, String(p.id)] : current.filter((id) => id !== String(p.id)))} /></TableCell><TableCell>{p.sku}</TableCell><TableCell>{p.name}</TableCell><TableCell>{p.ncm || 'Não informado'}</TableCell><TableCell><Status value={String(p.fiscal_status || '')} /></TableCell></TableRow>)}</TableBody></Table>
      </Card>}
      {active === 'monitoring' && <Card className="space-y-4"><Header title="Monitoramento da homologação" note="Recebimento/processamento não equivale a autorização da SEFAZ." count={documents.length} /><SimpleTable headers={['Referência', 'Modelo', 'Ambiente', 'Status']} rows={documents.map((d) => [d.reference || d.id, d.document_type, d.environment, <Status key="s" value={String(d.status || '')} />])} /></Card>}
    </div>
  );
}

function Header({ title, note, count }: { title: string; note: string; count: number }) { return <div className="flex items-start justify-between gap-4"><div><h2 className="font-bold uppercase text-white">{title}</h2><p className="mt-1 text-xs text-brand-grey">{note}</p></div><Badge variant="neutral">{count}</Badge></div>; }
function Status({ value }: { value: string }) { const good = ['approved', 'complete', 'authorized'].includes(value); const warn = ['draft', 'pending', 'review_required', 'processing'].includes(value); return <Badge variant={good ? 'success' : warn ? 'warning' : 'neutral'}>{value}</Badge>; }
function SimpleTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) { return <Table><TableHeader><TableRow>{headers.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.length ? rows.map((row, i) => <TableRow key={i}>{row.map((cell, j) => <TableCell key={j}>{cell}</TableCell>)}</TableRow>) : <TableRow><td colSpan={headers.length} className="px-4 py-8 text-center text-brand-grey">Nenhum registro.</td></TableRow>}</TableBody></Table>; }
