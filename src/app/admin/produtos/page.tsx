'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Image as ImageIcon, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { ProductFormModal, ProductFormState, ProductFieldErrors } from '@/components/products/ProductFormModal';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { productFormSchema } from '@/lib/products/schema';

interface Product {
  id: string;
  sku: string;
  location: string | null;
  name: string;
  brand: string | null;
  price: number;
  stock_quantity: number;
  category: string | null;
  image_url?: string | null;
  min_stock_quantity?: number | null;
  show_in_store?: boolean;
  stripe_sync_status?: string | null;
  stripe_sync_error?: string | null;
  gtin?: string | null;
  without_gtin?: boolean;
  ncm?: string | null;
  cest?: string | null;
  origin?: number | null;
  fiscal_origin?: number | null;
  unit?: string | null;
  taxable_unit?: string | null;
  fiscal_status?: 'pending' | 'review_required' | 'complete';
}

const emptyForm: ProductFormState = {
  sku: '', name: '', brand: '', category: '', location: '', price: '', stockQuantity: '0', minStock: '0',
  ncm: '', cest: '', fiscalOrigin: '', fiscalUnit: 'UN', gtin: '', withoutGtin: false, showInStore: false
};

function productToForm(product: Product): ProductFormState {
  const fiscalOrigin = product.fiscal_origin ?? product.origin;
  return {
    sku: product.sku || '', name: product.name || '', brand: product.brand || '', category: product.category || '',
    location: product.location || '', price: String(product.price ?? ''), stockQuantity: String(product.stock_quantity ?? 0),
    minStock: String(product.min_stock_quantity ?? 0), ncm: product.ncm || '', cest: product.cest || '',
    fiscalOrigin: (fiscalOrigin === null || fiscalOrigin === undefined ? '' : String(fiscalOrigin)) as ProductFormState['fiscalOrigin'],
    fiscalUnit: product.unit || product.taxable_unit || 'UN', gtin: product.gtin || '',
    withoutGtin: Boolean(product.without_gtin), showInStore: Boolean(product.show_in_store)
  };
}

const generatedSku = () => `TM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

export default function AdminProductsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [initialForm, setInitialForm] = useState<ProductFormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchProducts = async () => {
    const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    setProducts((data || []) as Product[]);
  };

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return router.push('/login');
        const [{ data: hasView }, { data: hasUpdate }] = await Promise.all([
          supabase.rpc('has_permission', { user_uuid: user.id, required_permission: 'products.view' }),
          supabase.rpc('has_permission', { user_uuid: user.id, required_permission: 'products.price.update' })
        ]);
        if (!hasView) return router.push('/403');
        setCanEdit(Boolean(hasUpdate));
        await fetchProducts();
      } catch (error) {
        toast.error('Erro ao carregar produtos', error instanceof Error ? error.message : 'Tente novamente.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [router, supabase]);

  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category).filter(Boolean) as string[])).sort(), [products]);
  const dirty = imageFile !== null || JSON.stringify(form) !== JSON.stringify(initialForm);

  const closeModal = (force = false) => {
    if (!force && dirty && !window.confirm('Descartar as alterações não salvas?')) return;
    setModalMode(null);
    setSelectedProduct(null);
    setForm(emptyForm);
    setInitialForm(emptyForm);
    setFieldErrors({});
    setImageFile(null);
  };

  const openCreate = () => {
    const next = { ...emptyForm };
    setForm(next);
    setInitialForm(next);
    setSelectedProduct(null);
    setModalMode('create');
  };

  const openEdit = (product: Product) => {
    const next = productToForm(product);
    setForm(next);
    setInitialForm(next);
    setSelectedProduct(product);
    setModalMode('edit');
  };

  const changeField = (field: keyof ProductFormState, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const uploadImage = async (sku: string) => {
    if (!imageFile) return selectedProduct?.image_url || null;
    const extension = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `products/${sku}_${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from('product-images').upload(path, imageFile, { upsert: false });
    if (error) throw error;
    return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  };

  const submitProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving || !modalMode) return;
    const parsed = productFormSchema.safeParse({
      ...form, price: Number(form.price || 0), stockQuantity: Number(form.stockQuantity || 0), minStock: Number(form.minStock || 0)
    });
    if (!parsed.success) {
      const errors: ProductFieldErrors = {};
      for (const issue of parsed.error.issues) errors[issue.path[0] as keyof ProductFormState] = issue.message;
      setFieldErrors(errors);
      return;
    }

    setIsSaving(true);
    try {
      const sku = parsed.data.sku || generatedSku();
      const imageUrl = await uploadImage(sku);
      const commonPayload = {
        sku, name: parsed.data.name, brand: parsed.data.brand || null, category: parsed.data.category || null,
        location: parsed.data.location || null, price: parsed.data.price, min_stock_quantity: parsed.data.minStock,
        image_url: imageUrl, show_in_store: parsed.data.showInStore,
        gtin: parsed.data.withoutGtin ? null : parsed.data.gtin || null, without_gtin: parsed.data.withoutGtin,
        ncm: parsed.data.ncm || null, cest: parsed.data.cest || null,
        origin: parsed.data.fiscalOrigin === '' ? null : Number(parsed.data.fiscalOrigin),
        fiscal_origin: parsed.data.fiscalOrigin === '' ? null : Number(parsed.data.fiscalOrigin),
        unit: parsed.data.fiscalUnit, taxable_unit: parsed.data.fiscalUnit
      };

      if (modalMode === 'create') {
        const { error } = await supabase.from('products').insert({ ...commonPayload, stock_quantity: parsed.data.stockQuantity });
        if (error) throw error;
      } else {
        if (!selectedProduct) throw new Error('Produto não selecionado.');
        const { error } = await supabase.from('products').update(commonPayload).eq('id', selectedProduct.id);
        if (error) throw error;
      }

      const savedMode = modalMode;
      closeModal(true);
      await fetchProducts();
      toast.success(savedMode === 'create' ? 'Produto salvo' : 'Alterações salvas', 'A classificação fiscal permanece pendente até que um perfil aprovado seja vinculado.');
    } catch (error) {
      toast.error('Não foi possível salvar', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const adjustStock = async (delta: number, reason: string) => {
    if (!selectedProduct || !Number.isFinite(delta) || delta === 0) throw new Error('Informe um ajuste válido.');
    const { data, error } = await supabase.rpc('adjust_product_stock', {
      p_product_id: selectedProduct.id, p_quantity_delta: delta, p_reason: reason
    });
    if (error) {
      toast.error('Ajuste não realizado', error.message);
      throw error;
    }
    const balance = Number(data);
    setSelectedProduct((current) => current ? { ...current, stock_quantity: balance } : current);
    setProducts((current) => current.map((product) => product.id === selectedProduct.id ? { ...product, stock_quantity: balance } : product));
    toast.success('Estoque ajustado', `Novo saldo: ${balance}. A movimentação foi registrada.`);
  };

  const syncProducts = async (productId?: string) => {
    if (!productId) setIsSyncingAll(true);
    try {
      const response = await fetch('/api/admin/stripe-sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productId ? { productId } : { syncAllPending: true })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao sincronizar.');
      await fetchProducts();
      toast.success('Sincronização concluída', productId ? 'Produto atualizado no Stripe.' : `${result.syncedCount || 0} produtos processados.`);
    } catch (error) {
      toast.error('Erro de sincronização', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const filteredProducts = products.filter((product) => {
    const query = searchQuery.toLowerCase().trim();
    return !query || [product.sku, product.name, product.brand, product.location, product.category].some((value) => value?.toLowerCase().includes(query));
  });

  return (
    <div className="relative space-y-6 text-left">
      <div>
        <Breadcrumb items={[{ label: 'Catálogo' }, { label: 'Produtos' }]} />
        <div className="mt-2 flex items-center justify-between border-b border-brand-grey/15 pb-4">
          <div><h1 className="text-2xl font-black italic uppercase tracking-tight text-white">Catálogo de produtos</h1><p className="mt-1 text-xs font-mono uppercase tracking-widest text-brand-grey">Cadastro comercial separado da resolução fiscal</p></div>
          <Badge variant="neutral">Produtos</Badge>
        </div>
      </div>
      <Card className="space-y-6">
        <div className="flex flex-col justify-between gap-4 border-b border-brand-grey/15 pb-4 sm:flex-row sm:items-center">
          <div><h2 className="text-xs font-bold uppercase tracking-wider text-white">Itens cadastrados</h2><p className="mt-1 text-[11px] text-brand-grey">Produtos incompletos podem ser salvos e entram na fila fiscal.</p></div>
          {canEdit ? <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={isSyncingAll} onClick={() => syncProducts()}>{isSyncingAll ? 'Sincronizando...' : 'Sincronizar pendentes'}</Button><Button size="sm" onClick={openCreate}>Novo produto</Button></div> : <div className="flex items-center gap-2 border border-brand-grey/10 bg-brand-darkgrey p-2 text-xs text-brand-grey"><ShieldAlert className="h-4 w-4 text-brand-red" /> Somente leitura</div>}
        </div>
        <div className="relative max-w-sm"><Input aria-label="Pesquisar produtos" placeholder="Pesquisar por SKU, nome, marca ou localização" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="pl-9 text-xs" /><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey" /></div>
        {isLoading ? <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : (
          <Table>
            <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead><TableHead>Fiscal</TableHead><TableHead>Stripe</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>{filteredProducts.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-mono text-brand-red"><span className="flex items-center gap-2">{product.image_url && <ImageIcon className="h-3.5 w-3.5 text-emerald-500" />}{product.sku}</span></TableCell>
                <TableCell><p className="font-bold text-white">{product.name}</p><p className="text-[10px] text-brand-grey">{product.brand || 'Sem marca'} · {product.category || 'Sem categoria'}</p></TableCell>
                <TableCell className="font-mono">R$ {Number(product.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                <TableCell className="font-mono">{Number(product.stock_quantity).toLocaleString('pt-BR')}</TableCell>
                <TableCell><Badge variant={product.fiscal_status === 'complete' ? 'success' : product.fiscal_status === 'review_required' ? 'warning' : 'neutral'}>{product.fiscal_status === 'complete' ? 'Completo' : product.fiscal_status === 'review_required' ? 'Revisar' : 'Pendente'}</Badge></TableCell>
                <TableCell><span className="flex items-center gap-2"><Badge variant={product.stripe_sync_status === 'synced' ? 'success' : product.stripe_sync_status === 'error' ? 'danger' : 'neutral'}>{product.stripe_sync_status === 'synced' ? 'Sincronizado' : product.stripe_sync_status === 'error' ? 'Erro' : 'Pendente'}</Badge>{canEdit && <button type="button" aria-label={`Sincronizar ${product.name}`} onClick={() => syncProducts(product.id)} className="text-brand-grey hover:text-brand-red"><RefreshCw className="h-3.5 w-3.5" /></button>}</span></TableCell>
                <TableCell className="text-right">{canEdit ? <Button variant="secondary" size="sm" onClick={() => openEdit(product)}>Editar</Button> : <span className="text-[10px] uppercase text-brand-grey">Somente leitura</span>}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Card>
      <ProductFormModal isOpen={modalMode !== null} mode={modalMode || 'create'} value={form}
        currentBalance={selectedProduct?.stock_quantity} fiscalStatus={selectedProduct?.fiscal_status}
        categories={categories} errors={fieldErrors} isSaving={isSaving} imageFile={imageFile}
        onChange={changeField} onImageChange={setImageFile} onClose={() => closeModal()}
        onSubmit={submitProduct} onAdjustStock={modalMode === 'edit' ? adjustStock : undefined} />
    </div>
  );
}
