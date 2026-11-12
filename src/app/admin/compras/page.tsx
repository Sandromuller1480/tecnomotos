'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FilePlus2, PackageCheck, PackagePlus, Plus, Sparkles, Truck, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

type PurchaseStatus = 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled';
type Tab = 'purchases' | 'suppliers' | 'intelligence';

interface Supplier {
  id: string; legal_name: string; trade_name: string | null; document: string | null; state_registration: string | null;
  contact_name: string | null; email: string | null; phone: string | null; city: string | null; state: string | null;
  payment_terms: string | null; lead_time_days: number; minimum_order_value: number; notes: string | null; active: boolean;
}

interface Product {
  id: string; sku: string | null; name: string; stock_quantity: number; min_stock_quantity: number | null;
  last_purchase_cost: number | null; average_purchase_cost: number | null; last_purchase_at: string | null;
  preferred_supplier_id: string | null;
}

interface PurchaseItem {
  id: string; product_id: string; product_name: string; product_sku: string | null; supplier_product_code: string | null;
  quantity_ordered: number; quantity_received: number; unit_cost: number; discount_amount: number; total_amount: number; notes: string | null;
}

interface PurchaseDocument {
  id: string; document_type: string; file_name: string; storage_path: string; mime_type: string | null; file_size: number | null;
}

interface Purchase {
  id: string; order_number: string; supplier_id: string; status: PurchaseStatus; issue_date: string; expected_date: string | null;
  received_at: string | null; invoice_number: string | null; invoice_series: string | null; invoice_access_key: string | null;
  payment_terms: string | null; payment_method: string | null; subtotal: number; freight_amount: number; discount_amount: number;
  total_amount: number; notes: string | null; created_at: string; suppliers: { legal_name: string; trade_name: string | null } | null;
  purchase_order_items: PurchaseItem[]; purchase_documents: PurchaseDocument[];
}

interface ItemForm { productId: string; quantity: string; unitCost: string; supplierCode: string; discount: string; notes: string }
interface PurchaseForm {
  id: string | null; supplierId: string; issueDate: string; expectedDate: string; invoiceNumber: string; invoiceSeries: string;
  invoiceAccessKey: string; paymentTerms: string; paymentMethod: string; freight: string; discount: string; notes: string; items: ItemForm[];
}

const today = () => new Date().toISOString().slice(0, 10);
const emptyItem = (): ItemForm => ({ productId: '', quantity: '1', unitCost: '', supplierCode: '', discount: '0', notes: '' });
const emptyPurchase = (): PurchaseForm => ({ id: null, supplierId: '', issueDate: today(), expectedDate: '', invoiceNumber: '', invoiceSeries: '', invoiceAccessKey: '', paymentTerms: '', paymentMethod: '', freight: '0', discount: '0', notes: '', items: [emptyItem()] });
const money = (value: number | string | null | undefined) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const statusLabels: Record<PurchaseStatus, string> = { draft: 'Rascunho', ordered: 'Pedido enviado', partial: 'Recebimento parcial', received: 'Recebida', cancelled: 'Cancelada' };
const statusVariants: Record<PurchaseStatus, 'neutral' | 'warning' | 'success' | 'danger'> = { draft: 'neutral', ordered: 'warning', partial: 'warning', received: 'success', cancelled: 'danger' };

export default function PurchasesPage() {
  const router = useRouter();
  const { error: showError, success: showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>('purchases');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissions, setPermissions] = useState({ create: false, update: false, receive: false });
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [search, setSearch] = useState('');
  const [productFilter, setProductFilter] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('produto') || '');
  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm | null>(null);
  const [supplierForm, setSupplierForm] = useState<Partial<Supplier> | null>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [files, setFiles] = useState<File[]>([]);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');
    const [viewResult, createResult, updateResult, receiveResult] = await Promise.all([
      supabase.rpc('has_permission', { user_uuid: user.id, required_permission: 'purchases.view' }),
      supabase.rpc('has_permission', { user_uuid: user.id, required_permission: 'purchases.create' }),
      supabase.rpc('has_permission', { user_uuid: user.id, required_permission: 'purchases.update' }),
      supabase.rpc('has_permission', { user_uuid: user.id, required_permission: 'purchases.receive' })
    ]);
    if (!viewResult.data) return router.push('/403');
    setPermissions({ create: Boolean(createResult.data), update: Boolean(updateResult.data), receive: Boolean(receiveResult.data) });

    const [supplierResult, productResult, purchaseResult] = await Promise.all([
      supabase.from('suppliers').select('*').order('legal_name'),
      supabase.from('products').select('id,sku,name,stock_quantity,min_stock_quantity,last_purchase_cost,average_purchase_cost,last_purchase_at,preferred_supplier_id').order('name'),
      supabase.from('purchase_orders').select(`*, suppliers(legal_name,trade_name), purchase_order_items(id,product_id,product_name,product_sku,supplier_product_code,quantity_ordered,quantity_received,unit_cost,discount_amount,total_amount,notes), purchase_documents(id,document_type,file_name,storage_path,mime_type,file_size)`).order('created_at', { ascending: false })
    ]);
    const error = supplierResult.error || productResult.error || purchaseResult.error;
    if (error) throw error;
    setSuppliers((supplierResult.data || []) as Supplier[]);
    setProducts((productResult.data || []) as Product[]);
    setPurchases((purchaseResult.data || []) as unknown as Purchase[]);
  }, [router, supabase]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        await load();
      } catch (error) {
        showError('Erro ao carregar compras', error instanceof Error ? error.message : 'Tente novamente.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [load, showError]);

  const lowStock = useMemo(() => products.filter((product) => Number(product.stock_quantity) <= Number(product.min_stock_quantity || 0)), [products]);
  const openPurchase = (purchase?: Purchase) => {
    if (!purchase) {
      setPurchaseForm(emptyPurchase()); setFiles([]); return;
    }
    setPurchaseForm({
      id: purchase.id, supplierId: purchase.supplier_id, issueDate: purchase.issue_date, expectedDate: purchase.expected_date || '',
      invoiceNumber: purchase.invoice_number || '', invoiceSeries: purchase.invoice_series || '', invoiceAccessKey: purchase.invoice_access_key || '',
      paymentTerms: purchase.payment_terms || '', paymentMethod: purchase.payment_method || '', freight: String(purchase.freight_amount || 0),
      discount: String(purchase.discount_amount || 0), notes: purchase.notes || '',
      items: purchase.purchase_order_items.map((item) => ({ productId: item.product_id, quantity: String(item.quantity_ordered), unitCost: String(item.unit_cost), supplierCode: item.supplier_product_code || '', discount: String(item.discount_amount || 0), notes: item.notes || '' }))
    });
    setFiles([]);
  };

  const setPurchaseField = <K extends keyof PurchaseForm>(key: K, value: PurchaseForm[K]) => setPurchaseForm((current) => current ? { ...current, [key]: value } : current);
  const setItem = (index: number, patch: Partial<ItemForm>) => setPurchaseForm((current) => current ? { ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) } : current);
  const formTotal = useMemo(() => {
    if (!purchaseForm) return 0;
    const subtotal = purchaseForm.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0) - Number(item.discount || 0), 0);
    return Math.max(subtotal + Number(purchaseForm.freight || 0) - Number(purchaseForm.discount || 0), 0);
  }, [purchaseForm]);

  const uploadDocuments = async (purchaseId: string) => {
    if (!files.length) return;
    const { data: { user } } = await supabase.auth.getUser();
    for (const file of files) {
      const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-');
      const storagePath = `${purchaseId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from('purchase-documents').upload(storagePath, file);
      if (uploadError) throw uploadError;
      const extension = file.name.split('.').pop()?.toLowerCase();
      const documentType = extension === 'xml' ? 'invoice_xml' : extension === 'pdf' ? 'invoice_pdf' : 'other';
      const { error: recordError } = await supabase.from('purchase_documents').insert({ purchase_order_id: purchaseId, document_type: documentType, file_name: file.name, storage_path: storagePath, mime_type: file.type || null, file_size: file.size, uploaded_by: user?.id || null });
      if (recordError) throw recordError;
    }
  };

  const savePurchase = async () => {
    if (!purchaseForm || saving) return;
    if (!purchaseForm.supplierId || !purchaseForm.items.length || purchaseForm.items.some((item) => !item.productId || Number(item.quantity) <= 0 || Number(item.unitCost) < 0)) {
      return showError('Revise a compra', 'Informe o fornecedor e todos os produtos, quantidades e custos.');
    }
    if (new Set(purchaseForm.items.map((item) => item.productId)).size !== purchaseForm.items.length) {
      return showError('Produto duplicado', 'Agrupe a quantidade do produto em uma única linha.');
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('save_purchase_order', {
        p_id: purchaseForm.id, p_supplier_id: purchaseForm.supplierId, p_issue_date: purchaseForm.issueDate,
        p_expected_date: purchaseForm.expectedDate || null, p_invoice_number: purchaseForm.invoiceNumber || null,
        p_invoice_series: purchaseForm.invoiceSeries || null, p_invoice_access_key: purchaseForm.invoiceAccessKey || null,
        p_payment_terms: purchaseForm.paymentTerms || null, p_payment_method: purchaseForm.paymentMethod || null,
        p_freight_amount: Number(purchaseForm.freight || 0), p_discount_amount: Number(purchaseForm.discount || 0), p_notes: purchaseForm.notes || null,
        p_items: purchaseForm.items.map((item) => ({ product_id: item.productId, quantity: Number(item.quantity), unit_cost: Number(item.unitCost), supplier_product_code: item.supplierCode || null, discount_amount: Number(item.discount || 0), notes: item.notes || null }))
      });
      if (error) throw error;
      await uploadDocuments(String(data));
      setPurchaseForm(null); setFiles([]); await load();
      showSuccess('Compra salva', 'O pedido ficou em rascunho e os documentos foram vinculados.');
    } catch (error) {
      showError('Não foi possível salvar', error instanceof Error ? error.message : 'Tente novamente.');
    } finally { setSaving(false); }
  };

  const saveSupplier = async () => {
    if (!supplierForm?.legal_name?.trim()) return showError('Informe a razão social', 'O nome do fornecedor é obrigatório.');
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        legal_name: supplierForm.legal_name.trim(), trade_name: supplierForm.trade_name || null, document: supplierForm.document || null,
        state_registration: supplierForm.state_registration || null, contact_name: supplierForm.contact_name || null, email: supplierForm.email || null,
        phone: supplierForm.phone || null, city: supplierForm.city || null, state: supplierForm.state?.toUpperCase() || null,
        payment_terms: supplierForm.payment_terms || null, lead_time_days: Number(supplierForm.lead_time_days || 0),
        minimum_order_value: Number(supplierForm.minimum_order_value || 0), notes: supplierForm.notes || null, active: supplierForm.active ?? true
      };
      const request = supplierForm.id
        ? supabase.from('suppliers').update(payload).eq('id', supplierForm.id)
        : supabase.from('suppliers').insert({ ...payload, created_by: user?.id || null });
      const { error } = await request;
      if (error) throw error;
      setSupplierForm(null); await load(); showSuccess('Fornecedor salvo', 'Cadastro disponível para novas compras.');
    } catch (error) { showError('Não foi possível salvar', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setSaving(false); }
  };

  const changeStatus = async (purchase: Purchase, action: 'order' | 'receive' | 'cancel') => {
    const messages = { order: 'marcar este pedido como enviado ao fornecedor', receive: 'receber todos os itens e atualizar estoque e custos', cancel: 'cancelar esta compra' };
    if (!window.confirm(`Confirma ${messages[action]}?`)) return;
    setSaving(true);
    try {
      const result = action === 'receive'
        ? await supabase.rpc('receive_purchase_order', { p_purchase_id: purchase.id })
        : await supabase.from('purchase_orders').update({ status: action === 'order' ? 'ordered' : 'cancelled' }).eq('id', purchase.id);
      if (result.error) throw result.error;
      setSelectedPurchase(null); await load();
      showSuccess(action === 'receive' ? 'Compra recebida' : 'Situação atualizada', action === 'receive' ? 'Estoque, custo médio e conta a pagar foram atualizados.' : 'A compra foi atualizada.');
    } catch (error) { showError('Operação não realizada', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setSaving(false); }
  };

  const downloadDocument = async (document: PurchaseDocument) => {
    const { data, error } = await supabase.storage.from('purchase-documents').createSignedUrl(document.storage_path, 60);
    if (error) return showError('Documento indisponível', error.message);
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const suggestedPurchase = (product: Product) => {
    const target = Math.max(Number(product.min_stock_quantity || 0) * 2, 1);
    const quantity = Math.max(target - Number(product.stock_quantity), 1);
    const next = emptyPurchase();
    next.supplierId = product.preferred_supplier_id || '';
    next.items = [{ ...emptyItem(), productId: product.id, quantity: String(quantity), unitCost: String(product.last_purchase_cost || product.average_purchase_cost || '') }];
    setPurchaseForm(next); setTab('purchases');
  };

  const filteredPurchases = purchases.filter((purchase) => {
    const query = search.toLowerCase().trim();
    const matchesProduct = !productFilter || purchase.purchase_order_items.some((item) => item.product_id === productFilter);
    const matchesQuery = !query || [purchase.order_number, purchase.invoice_number, purchase.suppliers?.legal_name, purchase.suppliers?.trade_name].some((value) => value?.toLowerCase().includes(query));
    return matchesProduct && matchesQuery;
  });
  const pendingValue = purchases.filter((purchase) => ['draft', 'ordered', 'partial'].includes(purchase.status)).reduce((sum, purchase) => sum + Number(purchase.total_amount), 0);

  if (loading) return <div className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-72 w-full" /></div>;

  return <div className="space-y-6 text-left">
    <div><Breadcrumb items={[{ label: 'Catálogo' }, { label: 'Compra de produtos' }]} /><div className="mt-2 flex flex-wrap items-end justify-between gap-4 border-b border-brand-grey/15 pb-4"><div><h1 className="text-2xl font-black italic uppercase text-white">Compra de produtos</h1><p className="mt-1 text-xs font-mono uppercase tracking-widest text-brand-grey">Fornecedores, documentos, custos e entrada inteligente no estoque</p></div>{permissions.create && <Button onClick={() => openPurchase()}><Plus className="h-4 w-4" />Nova compra</Button>}</div></div>

    <div className="grid gap-3 md:grid-cols-4">
      <Metric label="Compras cadastradas" value={String(purchases.length)} icon={PackagePlus} />
      <Metric label="Aguardando recebimento" value={String(purchases.filter((purchase) => ['draft', 'ordered', 'partial'].includes(purchase.status)).length)} icon={Truck} />
      <Metric label="Valor pendente" value={money(pendingValue)} icon={FilePlus2} />
      <Metric label="Itens para repor" value={String(lowStock.length)} icon={Sparkles} danger={lowStock.length > 0} />
    </div>

    <div className="flex flex-wrap gap-2 border-b border-brand-grey/15 pb-3">
      <TabButton active={tab === 'purchases'} onClick={() => setTab('purchases')}>Compras</TabButton>
      <TabButton active={tab === 'suppliers'} onClick={() => setTab('suppliers')}>Fornecedores</TabButton>
      <TabButton active={tab === 'intelligence'} onClick={() => setTab('intelligence')}>Sugestões inteligentes</TabButton>
    </div>

    {tab === 'purchases' && <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold uppercase text-white">Pedidos e entradas</h2><p className="text-xs text-brand-grey">O recebimento atualiza estoque, custo médio e contas a pagar.</p>{productFilter && <button type="button" onClick={() => setProductFilter('')} className="mt-2 text-xs text-brand-red hover:underline">Exibindo compras de {products.find((product) => product.id === productFilter)?.name || 'um produto'} · limpar filtro</button>}</div><div className="w-full max-w-xs"><Input isSearch placeholder="Número, nota ou fornecedor" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>
      <Table><TableHeader><TableRow><TableHead>Compra</TableHead><TableHead>Fornecedor</TableHead><TableHead>Emissão / previsão</TableHead><TableHead>Itens</TableHead><TableHead>Total</TableHead><TableHead>Situação</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>
        {filteredPurchases.length ? filteredPurchases.map((purchase) => <TableRow key={purchase.id}><TableCell><button type="button" onClick={() => setSelectedPurchase(purchase)} className="font-mono font-bold text-brand-red hover:underline">{purchase.order_number}</button><p className="text-[10px] text-brand-grey">NF {purchase.invoice_number || 'não informada'}</p></TableCell><TableCell><b className="text-white">{purchase.suppliers?.trade_name || purchase.suppliers?.legal_name}</b></TableCell><TableCell>{new Date(`${purchase.issue_date}T12:00:00`).toLocaleDateString('pt-BR')}<p className="text-[10px] text-brand-grey">{purchase.expected_date ? `Prevista ${new Date(`${purchase.expected_date}T12:00:00`).toLocaleDateString('pt-BR')}` : 'Sem previsão'}</p></TableCell><TableCell>{purchase.purchase_order_items.length}</TableCell><TableCell className="font-mono">{money(purchase.total_amount)}</TableCell><TableCell><Badge variant={statusVariants[purchase.status]}>{statusLabels[purchase.status]}</Badge></TableCell><TableCell><div className="flex flex-wrap gap-2">{permissions.update && purchase.status === 'draft' && <Button size="sm" variant="secondary" onClick={() => openPurchase(purchase)}>Editar</Button>}<Button size="sm" variant="ghost" onClick={() => setSelectedPurchase(purchase)}>Detalhes</Button></div></TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="py-10 text-center text-brand-grey">Nenhuma compra encontrada.</TableCell></TableRow>}
      </TableBody></Table>
    </Card>}

    {tab === 'suppliers' && <Card className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="font-bold uppercase text-white">Fornecedores</h2><p className="text-xs text-brand-grey">Condições comerciais e prazo médio de entrega.</p></div>{permissions.create && <Button size="sm" onClick={() => setSupplierForm({ active: true, lead_time_days: 0, minimum_order_value: 0 })}><Plus className="h-4 w-4" />Novo fornecedor</Button>}</div>
      <Table><TableHeader><TableRow><TableHead>Fornecedor</TableHead><TableHead>Documento</TableHead><TableHead>Contato</TableHead><TableHead>Prazo</TableHead><TableHead>Condição</TableHead><TableHead>Situação</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{suppliers.map((supplier) => <TableRow key={supplier.id}><TableCell><b className="text-white">{supplier.trade_name || supplier.legal_name}</b><p className="text-[10px] text-brand-grey">{supplier.legal_name}</p></TableCell><TableCell>{supplier.document || '—'}</TableCell><TableCell>{supplier.phone || supplier.email || '—'}<p className="text-[10px] text-brand-grey">{[supplier.city, supplier.state].filter(Boolean).join(' / ')}</p></TableCell><TableCell>{supplier.lead_time_days} dias</TableCell><TableCell>{supplier.payment_terms || 'Não informada'}</TableCell><TableCell><Badge variant={supplier.active ? 'success' : 'neutral'}>{supplier.active ? 'Ativo' : 'Inativo'}</Badge></TableCell><TableCell>{permissions.update && <Button size="sm" variant="secondary" onClick={() => setSupplierForm(supplier)}>Editar</Button>}</TableCell></TableRow>)}</TableBody></Table>
    </Card>}

    {tab === 'intelligence' && <Card className="space-y-4"><div><h2 className="flex items-center gap-2 font-bold uppercase text-white"><Sparkles className="h-4 w-4 text-brand-red" />Sugestões de reposição</h2><p className="text-xs text-brand-grey">Prioridade calculada pelo saldo atual, estoque mínimo, último custo e fornecedor preferencial.</p></div>
      <Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Saldo</TableHead><TableHead>Mínimo</TableHead><TableHead>Sugestão</TableHead><TableHead>Último custo</TableHead><TableHead>Fornecedor</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader><TableBody>{lowStock.length ? lowStock.map((product) => { const supplier = suppliers.find((item) => item.id === product.preferred_supplier_id); const suggestion = Math.max(Math.max(Number(product.min_stock_quantity || 0) * 2, 1) - Number(product.stock_quantity), 1); return <TableRow key={product.id}><TableCell><b className="text-white">{product.name}</b><p className="font-mono text-[10px] text-brand-red">{product.sku || 'SEM SKU'}</p></TableCell><TableCell>{Number(product.stock_quantity).toLocaleString('pt-BR')}</TableCell><TableCell>{Number(product.min_stock_quantity || 0).toLocaleString('pt-BR')}</TableCell><TableCell><Badge variant="warning">Comprar {suggestion.toLocaleString('pt-BR')}</Badge></TableCell><TableCell>{product.last_purchase_cost === null ? '—' : money(product.last_purchase_cost)}</TableCell><TableCell>{supplier?.trade_name || supplier?.legal_name || 'A definir'}</TableCell><TableCell>{permissions.create && <Button size="sm" onClick={() => suggestedPurchase(product)}>Criar compra</Button>}</TableCell></TableRow>; }) : <TableRow><TableCell colSpan={7} className="py-10 text-center text-emerald-400">Todos os produtos estão acima do estoque mínimo.</TableCell></TableRow>}</TableBody></Table>
    </Card>}

    <PurchaseEditor form={purchaseForm} products={products} suppliers={suppliers.filter((supplier) => supplier.active)} files={files} saving={saving} total={formTotal} setFiles={setFiles} setField={setPurchaseField} setItem={setItem} addItem={() => setPurchaseForm((current) => current ? { ...current, items: [...current.items, emptyItem()] } : current)} removeItem={(index) => setPurchaseForm((current) => current ? { ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) } : current)} close={() => setPurchaseForm(null)} save={savePurchase} />
    <SupplierEditor form={supplierForm} saving={saving} setForm={setSupplierForm} close={() => setSupplierForm(null)} save={saveSupplier} />
    <PurchaseDetails purchase={selectedPurchase} canUpdate={permissions.update} canReceive={permissions.receive} saving={saving} close={() => setSelectedPurchase(null)} download={downloadDocument} action={changeStatus} />
  </div>;
}

function Metric({ label, value, icon: Icon, danger }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; danger?: boolean }) { return <Card className="flex items-center justify-between"><div><p className="text-[10px] font-mono uppercase tracking-widest text-brand-grey">{label}</p><p className={`mt-2 text-xl font-black ${danger ? 'text-brand-red' : 'text-white'}`}>{value}</p></div><Icon className={`h-6 w-6 ${danger ? 'text-brand-red' : 'text-brand-grey'}`} /></Card>; }
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`border px-4 py-2 text-xs font-bold uppercase ${active ? 'border-brand-red bg-brand-red text-white' : 'border-brand-grey/20 text-brand-grey hover:text-white'}`}>{children}</button>; }

function PurchaseEditor({ form, products, suppliers, files, saving, total, setFiles, setField, setItem, addItem, removeItem, close, save }: { form: PurchaseForm | null; products: Product[]; suppliers: Supplier[]; files: File[]; saving: boolean; total: number; setFiles: (files: File[]) => void; setField: <K extends keyof PurchaseForm>(key: K, value: PurchaseForm[K]) => void; setItem: (index: number, patch: Partial<ItemForm>) => void; addItem: () => void; removeItem: (index: number) => void; close: () => void; save: () => void }) {
  if (!form) return null;
  return <Modal isOpen onClose={close} title={form.id ? 'Editar compra' : 'Nova compra de produtos'} size="xl" footer={<><Button variant="ghost" onClick={close}>Cancelar</Button><Button disabled={saving} onClick={save}>{saving ? 'Salvando...' : 'Salvar rascunho'}</Button></>}><div className="space-y-5">
    <section className="grid gap-4 md:grid-cols-3"><Select label="Fornecedor *" value={form.supplierId} options={[{ value: '', label: 'Selecione' }, ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.trade_name || supplier.legal_name }))]} onChange={(event) => setField('supplierId', event.target.value)} /><Input label="Data de emissão *" type="date" value={form.issueDate} onChange={(event) => setField('issueDate', event.target.value)} /><Input label="Previsão de entrega" type="date" value={form.expectedDate} onChange={(event) => setField('expectedDate', event.target.value)} /><Input label="Número da nota" value={form.invoiceNumber} onChange={(event) => setField('invoiceNumber', event.target.value)} /><Input label="Série" value={form.invoiceSeries} onChange={(event) => setField('invoiceSeries', event.target.value)} /><Input label="Chave da NF-e (44 dígitos)" maxLength={44} value={form.invoiceAccessKey} onChange={(event) => setField('invoiceAccessKey', event.target.value.replace(/\D/g, ''))} /><Input label="Condição de pagamento" value={form.paymentTerms} onChange={(event) => setField('paymentTerms', event.target.value)} /><Select label="Forma de pagamento" value={form.paymentMethod} options={['', 'PIX', 'Boleto', 'Cartão', 'Transferência', 'Dinheiro', 'Prazo'].map((value) => ({ value, label: value || 'Selecione' }))} onChange={(event) => setField('paymentMethod', event.target.value)} /><div className="grid grid-cols-2 gap-2"><Input label="Frete" type="number" min="0" step="0.01" value={form.freight} onChange={(event) => setField('freight', event.target.value)} /><Input label="Desconto" type="number" min="0" step="0.01" value={form.discount} onChange={(event) => setField('discount', event.target.value)} /></div></section>
    <section className="space-y-3 border-t border-brand-grey/15 pt-4"><div className="flex items-center justify-between"><div><h4 className="font-bold uppercase text-white">Produtos e peças</h4><p className="text-xs text-brand-grey">Cada item fica ligado ao cadastro usado nas vendas.</p></div><Button size="sm" variant="secondary" onClick={addItem}><Plus className="h-4 w-4" />Adicionar item</Button></div>{form.items.map((item, index) => <div key={index} className="grid gap-3 border border-brand-grey/15 bg-black/20 p-3 md:grid-cols-[2fr_100px_130px_130px_36px]"><Select label="Produto *" value={item.productId} options={[{ value: '', label: 'Selecione' }, ...products.map((product) => ({ value: product.id, label: `${product.sku || 'SEM SKU'} · ${product.name}` }))]} onChange={(event) => { const product = products.find((entry) => entry.id === event.target.value); setItem(index, { productId: event.target.value, unitCost: item.unitCost || String(product?.last_purchase_cost || product?.average_purchase_cost || '') }); }} /><Input label="Quantidade *" type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => setItem(index, { quantity: event.target.value })} /><Input label="Custo unitário *" type="number" min="0" step="0.0001" value={item.unitCost} onChange={(event) => setItem(index, { unitCost: event.target.value })} /><Input label="Código fornecedor" value={item.supplierCode} onChange={(event) => setItem(index, { supplierCode: event.target.value })} /><button type="button" aria-label="Remover item" disabled={form.items.length === 1} onClick={() => removeItem(index)} className="mt-6 flex h-10 items-center justify-center border border-brand-red/40 text-brand-red disabled:opacity-30"><X className="h-4 w-4" /></button></div>)}</section>
    <section className="grid gap-4 border-t border-brand-grey/15 pt-4 md:grid-cols-2"><div><label className="text-xs font-bold uppercase tracking-widest text-brand-grey">Observações</label><textarea value={form.notes} onChange={(event) => setField('notes', event.target.value)} className="mt-1 min-h-24 w-full border border-brand-grey/20 bg-brand-darkgrey p-3 text-sm text-white outline-none focus:border-brand-red" /></div><div className="space-y-3"><label className="block text-xs font-bold uppercase tracking-widest text-brand-grey">Notas e documentos</label><input type="file" multiple accept=".pdf,.xml,image/*,.txt" onChange={(event) => setFiles(Array.from(event.target.files || []))} className="w-full border border-brand-grey/20 bg-brand-darkgrey p-2 text-xs file:mr-2 file:border-0 file:bg-brand-red file:px-3 file:py-2 file:text-white" />{files.map((file) => <p key={`${file.name}-${file.size}`} className="text-xs text-brand-grey">{file.name} · {(file.size / 1024).toFixed(1)} KB</p>)}<div className="border border-brand-red/25 bg-brand-red/5 p-3 text-right"><p className="text-[10px] uppercase text-brand-grey">Total estimado</p><p className="text-xl font-black text-white">{money(total)}</p></div></div></section>
  </div></Modal>;
}

function SupplierEditor({ form, saving, setForm, close, save }: { form: Partial<Supplier> | null; saving: boolean; setForm: (form: Partial<Supplier> | null) => void; close: () => void; save: () => void }) {
  if (!form) return null;
  const set = (key: keyof Supplier, value: string | number | boolean) => setForm({ ...form, [key]: value });
  return <Modal isOpen onClose={close} title={form.id ? 'Editar fornecedor' : 'Novo fornecedor'} size="xl" footer={<><Button variant="ghost" onClick={close}>Cancelar</Button><Button disabled={saving} onClick={save}>Salvar fornecedor</Button></>}><div className="grid gap-4 md:grid-cols-3"><Input label="Razão social *" value={form.legal_name || ''} onChange={(event) => set('legal_name', event.target.value)} /><Input label="Nome fantasia" value={form.trade_name || ''} onChange={(event) => set('trade_name', event.target.value)} /><Input label="CNPJ/CPF" value={form.document || ''} onChange={(event) => set('document', event.target.value)} /><Input label="Inscrição estadual" value={form.state_registration || ''} onChange={(event) => set('state_registration', event.target.value)} /><Input label="Contato" value={form.contact_name || ''} onChange={(event) => set('contact_name', event.target.value)} /><Input label="Telefone" value={form.phone || ''} onChange={(event) => set('phone', event.target.value)} /><Input label="E-mail" type="email" value={form.email || ''} onChange={(event) => set('email', event.target.value)} /><Input label="Cidade" value={form.city || ''} onChange={(event) => set('city', event.target.value)} /><Input label="UF" maxLength={2} value={form.state || ''} onChange={(event) => set('state', event.target.value.toUpperCase())} /><Input label="Prazo médio (dias)" type="number" min="0" value={form.lead_time_days || 0} onChange={(event) => set('lead_time_days', Number(event.target.value))} /><Input label="Pedido mínimo" type="number" min="0" step="0.01" value={form.minimum_order_value || 0} onChange={(event) => set('minimum_order_value', Number(event.target.value))} /><Input label="Condição de pagamento" value={form.payment_terms || ''} onChange={(event) => set('payment_terms', event.target.value)} /><label className="flex items-center gap-2 text-xs font-bold uppercase text-white"><input type="checkbox" checked={form.active ?? true} onChange={(event) => set('active', event.target.checked)} />Fornecedor ativo</label></div></Modal>;
}

function PurchaseDetails({ purchase, canUpdate, canReceive, saving, close, download, action }: { purchase: Purchase | null; canUpdate: boolean; canReceive: boolean; saving: boolean; close: () => void; download: (document: PurchaseDocument) => void; action: (purchase: Purchase, action: 'order' | 'receive' | 'cancel') => void }) {
  if (!purchase) return null;
  return <Modal isOpen onClose={close} title={`Compra ${purchase.order_number}`} size="xl" footer={<><Button variant="ghost" onClick={close}>Fechar</Button>{canUpdate && purchase.status === 'draft' && <Button variant="secondary" disabled={saving} onClick={() => action(purchase, 'order')}>Marcar como pedido</Button>}{canReceive && !['received', 'cancelled'].includes(purchase.status) && <Button disabled={saving} onClick={() => action(purchase, 'receive')}><PackageCheck className="h-4 w-4" />Receber no estoque</Button>}{canUpdate && !['received', 'cancelled'].includes(purchase.status) && <Button variant="danger" disabled={saving} onClick={() => action(purchase, 'cancel')}>Cancelar compra</Button>}</>}><div className="space-y-5"><div className="grid gap-3 md:grid-cols-4"><Info label="Fornecedor" value={purchase.suppliers?.trade_name || purchase.suppliers?.legal_name || '—'} /><Info label="Situação" value={statusLabels[purchase.status]} /><Info label="Nota fiscal" value={purchase.invoice_number || 'Não informada'} /><Info label="Total" value={money(purchase.total_amount)} /></div><Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Quantidade</TableHead><TableHead>Recebida</TableHead><TableHead>Custo</TableHead><TableHead>Total</TableHead></TableRow></TableHeader><TableBody>{purchase.purchase_order_items.map((item) => <TableRow key={item.id}><TableCell><b className="text-white">{item.product_name}</b><p className="font-mono text-[10px] text-brand-red">{item.product_sku || 'SEM SKU'}</p></TableCell><TableCell>{Number(item.quantity_ordered).toLocaleString('pt-BR')}</TableCell><TableCell>{Number(item.quantity_received).toLocaleString('pt-BR')}</TableCell><TableCell>{money(item.unit_cost)}</TableCell><TableCell>{money(item.total_amount)}</TableCell></TableRow>)}</TableBody></Table><div><h4 className="mb-2 font-bold uppercase text-white">Documentos</h4>{purchase.purchase_documents.length ? <div className="grid gap-2 md:grid-cols-2">{purchase.purchase_documents.map((document) => <button key={document.id} type="button" onClick={() => download(document)} className="flex items-center justify-between border border-brand-grey/20 p-3 text-left text-xs text-brand-silver hover:border-brand-red"><span>{document.file_name}</span><Download className="h-4 w-4 text-brand-red" /></button>)}</div> : <p className="text-xs text-brand-grey">Nenhum documento anexado.</p>}</div></div></Modal>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="border border-brand-grey/15 bg-black/20 p-3"><p className="text-[10px] font-mono uppercase text-brand-grey">{label}</p><p className="mt-1 font-bold text-white">{value}</p></div>; }
