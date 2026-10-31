'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, X, Check, Image as ImageIcon, Search, RefreshCw } from 'lucide-react';

interface Product {
  id?: string;
  sku: string;
  location: string;
  name: string;
  brand: string;
  price: number;
  stock_quantity: number;
  category: string;
  image_url?: string;
  min_stock_quantity?: number;
  show_in_store?: boolean;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  stripe_sync_status?: string | null;
  stripe_sync_error?: string | null;
  stripe_last_synced_at?: string | null;
  gtin?: string | null;
  ncm?: string | null;
  cest?: string | null;
  cfop?: string | null;
  cst?: string | null;
  csosn?: string | null;
  origin?: number | null;
  fiscal_origin?: number | null;
  unit?: string | null;
  taxable_unit?: string | null;
}

const fiscalOriginOptions = [
  { value: '', label: 'Selecione a origem' },
  { value: '0', label: '0 - Nacional' },
  { value: '1', label: '1 - Estrangeira: importação direta' },
  { value: '2', label: '2 - Estrangeira: adquirida no mercado interno' },
  { value: '3', label: '3 - Nacional, conteúdo de importação superior a 40%' },
  { value: '4', label: '4 - Nacional, produção conforme processos básicos' },
  { value: '5', label: '5 - Nacional, conteúdo de importação até 40%' },
  { value: '6', label: '6 - Estrangeira: importação direta sem similar nacional' },
  { value: '7', label: '7 - Estrangeira: mercado interno sem similar nacional' },
  { value: '8', label: '8 - Nacional, conteúdo de importação superior a 70%' }
];

const digitsOnly = (value: string, maxLength: number) => value.replace(/\D/g, '').slice(0, maxLength);

export default function AdminProductsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { success, error, info } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [showEditSuccessOverlay, setShowEditSuccessOverlay] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [sku, setSku] = useState('');
  const [location, setLocation] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [minStock, setMinStock] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [showInStore, setShowInStore] = useState(false);
  const [gtin, setGtin] = useState('');
  const [ncm, setNcm] = useState('');
  const [cest, setCest] = useState('');
  const [cfop, setCfop] = useState('');
  const [cst, setCst] = useState('');
  const [csosn, setCsosn] = useState('');
  const [fiscalOrigin, setFiscalOrigin] = useState('');
  const [fiscalUnit, setFiscalUnit] = useState('UN');
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  const handleSyncPending = async () => {
    setIsSyncingAll(true);
    info('Sincronizando', 'Iniciando sincronização de produtos pendentes com o Stripe...');
    try {
      const res = await fetch('/api/admin/stripe-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncAllPending: true })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao sincronizar');

      success('Sincronizado', `${data.syncedCount} produtos pendentes foram sincronizados com sucesso.`);
      await fetchProducts();
    } catch (e: any) {
      error('Erro ao sincronizar', e.message || 'Erro inesperado.');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleSyncSingle = async (productId: string) => {
    info('Sincronizando', 'Sincronizando produto com o Stripe...');
    try {
      const res = await fetch('/api/admin/stripe-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao sincronizar');

      success('Sincronizado', 'Produto sincronizado com sucesso no Stripe.');
      await fetchProducts();
    } catch (e: any) {
      error('Erro ao sincronizar', e.message || 'Erro inesperado.');
    }
  };


  const fetchProducts = async () => {
    try {
      const { data, error: fetchErr } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      setProducts((data || []) as Product[]);
    } catch (e: unknown) {
      console.warn('[Products] DB query failed: ', e);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    async function checkAuthAndLoad() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Check view permission
      const { data: hasView } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'products.view'
      });

      if (!hasView) {
        router.push('/403');
        return;
      }

      // Check create permission
      const { data: hasCreate } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'products.price.update'
      });

      setIsOwner(!!hasCreate);
      await fetchProducts();
    }

    checkAuthAndLoad();
  }, []);

  const resetForm = () => {
    setSku('');
    setLocation('');
    setName('');
    setBrand('');
    setCategory('');
    setPrice('');
    setStockQuantity('');
    setMinStock('');
    setImageFile(null);
    setShowInStore(false);
    setGtin('');
    setNcm('');
    setCest('');
    setCfop('');
    setCst('');
    setCsosn('');
    setFiscalOrigin('');
    setFiscalUnit('UN');
  };

  const validateFiscalFields = () => {
    if (ncm && ncm.length !== 8) return 'O NCM deve conter exatamente 8 dígitos.';
    if (cest && cest.length !== 7) return 'O CEST deve conter exatamente 7 dígitos.';
    if (cfop && cfop.length !== 4) return 'O CFOP deve conter exatamente 4 dígitos.';
    if (cst && cst.length !== 2) return 'O CST do ICMS deve conter exatamente 2 dígitos.';
    if (csosn && csosn.length !== 3) return 'O CSOSN deve conter exatamente 3 dígitos.';
    if (cst && csosn) return 'Preencha CST ou CSOSN, nunca os dois ao mesmo tempo.';
    if (gtin && ![8, 12, 13, 14].includes(gtin.length)) return 'O GTIN deve conter 8, 12, 13 ou 14 dígitos.';
    return null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  const handleConfirmCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const fiscalError = validateFiscalFields();
      if (fiscalError) throw new Error(fiscalError);

      // 1. Resolve optional default fields
      const finalSku = sku.trim() || `SKU-${Math.floor(100000 + Math.random() * 900000)}`;
      const finalName = name.trim() || 'Produto Sem Nome';
      const finalPrice = parseFloat(price) || 0;
      const finalStock = parseInt(stockQuantity) || 0;
      const finalMinStock = parseInt(minStock) || 0;

      // 2. Upload file to Supabase Storage if present
      let uploadedImageUrl = '';
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${finalSku}_${Date.now()}.${fileExt}`;
        const filePath = `products/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(filePath, imageFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);

        uploadedImageUrl = urlData.publicUrl;
      }

      // 3. Save product to Supabase DB products table
      const { data: insertedData, error: insertError } = await supabase
        .from('products')
        .insert({
          sku: finalSku,
          location: location.trim() || null,
          name: finalName,
          brand: brand.trim() || null,
          price: finalPrice,
          stock_quantity: finalStock,
          min_stock_quantity: finalMinStock,
          category: category.trim() || null,
          image_url: uploadedImageUrl || null,
          show_in_store: showInStore,
          gtin: gtin || null,
          ncm: ncm || null,
          cest: cest || null,
          cfop: cfop || null,
          cst: cst || null,
          csosn: csosn || null,
          origin: fiscalOrigin === '' ? null : Number(fiscalOrigin),
          fiscal_origin: fiscalOrigin === '' ? null : Number(fiscalOrigin),
          unit: fiscalUnit.trim().toUpperCase() || null,
          taxable_unit: fiscalUnit.trim().toUpperCase() || null
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Trigger Stripe sync asynchronously in background
      if (insertedData?.id) {
        fetch('/api/admin/stripe-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: insertedData.id })
        }).catch(e => console.warn('Failed to auto-sync to Stripe:', e));
      }

      // Reset form fields
      resetForm();

      // Show success overlay in the center of the screen
      setShowSuccessOverlay(true);

      // Auto close success overlay after 2.5 seconds, keeping modal open
      setTimeout(() => {
        setShowSuccessOverlay(false);
      }, 2500);

      // Refresh product list
      await fetchProducts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao cadastrar produto.';
      error('Erro de Cadastro', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelarCadastro = () => {
    // If any field is filled, reset them
    if (sku || location || name || brand || category || price || stockQuantity || minStock || imageFile || showInStore || gtin || ncm || cest || cfop || cst || csosn || fiscalOrigin || fiscalUnit !== 'UN') {
      resetForm();
      info('Campos Limpos', 'O formulário foi resetado para o próximo produto.');
    }
  };

  const handleOpenEdit = (p: Product) => {
    setSku(p.sku);
    setLocation(p.location || '');
    setName(p.name);
    setBrand(p.brand || '');
    setCategory(p.category || '');
    setPrice(p.price.toString());
    setStockQuantity(p.stock_quantity.toString());
    setMinStock((p.min_stock_quantity || 0).toString());
    setShowInStore(!!p.show_in_store);
    setGtin(p.gtin || '');
    setNcm(p.ncm || '');
    setCest(p.cest || '');
    setCfop(p.cfop || '');
    setCst(p.cst || '');
    setCsosn(p.csosn || '');
    setFiscalOrigin(String(p.fiscal_origin ?? p.origin ?? ''));
    setFiscalUnit(p.taxable_unit || p.unit || 'UN');
    setSelectedProduct(p);
    setIsEditModalOpen(true);
  };

  const handleEditConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setIsSaving(true);

    try {
      const fiscalError = validateFiscalFields();
      if (fiscalError) throw new Error(fiscalError);

      const finalSku = sku.trim() || selectedProduct.sku;
      const finalName = name.trim() || 'Produto Sem Nome';
      const finalPrice = parseFloat(price) || 0;
      const finalStock = parseInt(stockQuantity) || 0;
      const finalMinStock = parseInt(minStock) || 0;

      // Upload file to Supabase Storage if a new one is selected
      let uploadedImageUrl = selectedProduct.image_url || null;
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${finalSku}_${Date.now()}.${fileExt}`;
        const filePath = `products/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(filePath, imageFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);

        uploadedImageUrl = urlData.publicUrl;
      }

      // Update database products table
      const { error: updateError } = await supabase
        .from('products')
        .update({
          sku: finalSku,
          location: location.trim() || null,
          name: finalName,
          brand: brand.trim() || null,
          price: finalPrice,
          stock_quantity: finalStock,
          min_stock_quantity: finalMinStock,
          category: category.trim() || null,
          image_url: uploadedImageUrl,
          show_in_store: showInStore,
          gtin: gtin || null,
          ncm: ncm || null,
          cest: cest || null,
          cfop: cfop || null,
          cst: cst || null,
          csosn: csosn || null,
          origin: fiscalOrigin === '' ? null : Number(fiscalOrigin),
          fiscal_origin: fiscalOrigin === '' ? null : Number(fiscalOrigin),
          unit: fiscalUnit.trim().toUpperCase() || null,
          taxable_unit: fiscalUnit.trim().toUpperCase() || null
        })
        .eq('sku', selectedProduct.sku); // Match by original SKU

      if (updateError) throw updateError;

      // Trigger Stripe sync asynchronously in background
      if (selectedProduct?.id) {
        fetch('/api/admin/stripe-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: selectedProduct.id })
        }).catch(e => console.warn('Failed to auto-sync edit to Stripe:', e));
      }

      // Close modal and reset fields
      setIsEditModalOpen(false);
      resetForm();
      setSelectedProduct(null);

      // Show success edit overlay in the center of the screen
      setShowEditSuccessOverlay(true);

      // Auto close success overlay after 2.5 seconds (reading time)
      setTimeout(() => {
        setShowEditSuccessOverlay(false);
      }, 2500);

      // Refresh product list
      await fetchProducts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar produto.';
      error('Erro de Edição', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      p.sku.toLowerCase().includes(query) ||
      p.name.toLowerCase().includes(query) ||
      (p.brand && p.brand.toLowerCase().includes(query)) ||
      (p.location && p.location.toLowerCase().includes(query)) ||
      (p.category && p.category.toLowerCase().includes(query))
    );
  });

  return (
    <div className="space-y-6 text-left relative">
      <div>
        <Breadcrumb items={[{ label: 'Catálogo' }, { label: 'Produtos' }]} />
        <div className="flex justify-between items-center mt-2 border-b border-brand-grey/15 pb-4">
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
              Catálogo de Produtos
            </h1>
            <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
              Gerencie as peças, marcas e preços do estoque
            </p>
          </div>
          <Badge variant="neutral">Visualização de Catálogo</Badge>
        </div>
      </div>

      <Card className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-brand-grey/15 pb-4">
          <div>
            <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-white">
              Lista de Itens cadastrados
            </h4>
            <p className="text-[11px] text-brand-grey mt-0.5">Módulo estruturado integrado ao banco de dados.</p>
          </div>
          {isOwner ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSyncPending}
                disabled={isSyncingAll}
              >
                {isSyncingAll ? 'Sincronizando...' : 'Sincronizar Pendentes'}
              </Button>
              <Button size="sm" onClick={() => setIsModalOpen(true)}>Novo Produto</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-brand-grey text-xs font-mono bg-brand-darkgrey p-2 border border-brand-grey/10">
              <ShieldAlert className="w-4 h-4 text-brand-red" />
              <span>Apenas o proprietário pode criar produtos / gerenciar preços.</span>
            </div>
          )}
        </div>

        {/* Search Input */}
        <div className="relative w-full max-w-sm">
          <Input
            placeholder="Pesquisar por código, nome, marca ou locação..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs font-mono bg-brand-input"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey/60 pointer-events-none z-10" />
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Locação</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Preço Venda</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Stripe</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((p, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-brand-red flex items-center gap-1.5">
                    {p.image_url ? <ImageIcon className="w-3.5 h-3.5 text-emerald-500" /> : null}
                    {p.sku}
                  </TableCell>
                  <TableCell className="font-mono text-brand-grey">{p.location || 'Sem Locação'}</TableCell>
                  <TableCell className="font-bold text-white">{p.name}</TableCell>
                  <TableCell>{p.brand || 'Genérico'}</TableCell>
                  <TableCell className="font-mono text-white">
                    R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="font-mono">{p.stock_quantity} un</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {p.stripe_sync_status === 'synced' && (
                        <Badge variant="success" className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Sincronizado</Badge>
                      )}
                      {p.stripe_sync_status === 'syncing' && (
                        <Badge variant="neutral" className="text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/20 animate-pulse">Sincronizando</Badge>
                      )}
                      {p.stripe_sync_status === 'error' && (
                        <div className="group relative inline-block cursor-help">
                          <Badge variant="danger" className="text-[9px]">Erro</Badge>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-48 bg-brand-card border border-brand-grey/25 text-[10px] text-brand-grey p-2 rounded shadow-lg z-50">
                            {p.stripe_sync_error || 'Erro desconhecido'}
                          </div>
                        </div>
                      )}
                      {(!p.stripe_sync_status || p.stripe_sync_status === 'pending') && (
                        <Badge variant="neutral" className="text-[9px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pendente</Badge>
                      )}
                      {isOwner && p.id && (
                        <button
                          onClick={() => handleSyncSingle(p.id!)}
                          title="Sincronizar com Stripe"
                          className="p-1 hover:text-brand-red text-brand-grey transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {isOwner ? (
                      <Button variant="secondary" size="sm" onClick={() => handleOpenEdit(p)}>
                        Editar Produto
                      </Button>
                    ) : (
                      <span className="text-[11px] font-mono text-brand-grey uppercase">Somente Leitura</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* REGISTRATION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-3xl mx-4 relative p-6 space-y-6 max-h-[90vh] overflow-y-auto" withStripe>
            {/* Close Button (X) */}
            <button
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
              className="absolute top-4 right-4 text-brand-grey hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-lg font-black italic uppercase tracking-tight text-white">
                Cadastrar Novo Produto
              </h3>
              <p className="text-[10px] text-brand-grey font-mono uppercase tracking-widest mt-1">
                Adicione peças ou componentes ao catálogo da TECNOMOTOS
              </p>
            </div>

            <form onSubmit={handleConfirmCadastro} className="space-y-4 text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Código (SKU) (Opcional)</label>
                  <Input
                    placeholder="Auto-gerado se vazio"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Locação de Estoque</label>
                  <Input
                    placeholder="Ex: Corredor D"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Nome do Produto (Opcional)</label>
                  <Input
                    placeholder="Ex: Pneu Pirelli Superbike Diablo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Marca</label>
                  <Input
                    placeholder="Ex: Pirelli"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Categoria</label>
                  <Input
                    placeholder="Ex: Pneus"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Preço de Venda (R$) (Opcional)</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Estoque Inicial (Qtd) (Opcional)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Estoque Mínimo (Qtd) (Opcional)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2 mt-2 border-t border-brand-grey/15 pt-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">Dados fiscais</h4>
                  <p className="mt-1 text-[10px] font-mono text-brand-grey">
                    Preencha conforme orientação do contador. Estes dados são necessários para emitir NFC-e.
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">NCM</label>
                  <Input inputMode="numeric" placeholder="8 dígitos" value={ncm} onChange={(e) => setNcm(digitsOnly(e.target.value, 8))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">CEST (quando aplicável)</label>
                  <Input inputMode="numeric" placeholder="7 dígitos" value={cest} onChange={(e) => setCest(digitsOnly(e.target.value, 7))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">CFOP padrão para NFC-e</label>
                  <Input inputMode="numeric" placeholder="4 dígitos" value={cfop} onChange={(e) => setCfop(digitsOnly(e.target.value, 4))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">CSOSN (Simples Nacional)</label>
                  <Input inputMode="numeric" placeholder="3 dígitos" value={csosn} onChange={(e) => setCsosn(digitsOnly(e.target.value, 3))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">CST ICMS (regime normal)</label>
                  <Input inputMode="numeric" placeholder="Deixe vazio no Simples" value={cst} onChange={(e) => setCst(digitsOnly(e.target.value, 2))} />
                </div>
                <Select
                  label="Origem da mercadoria"
                  value={fiscalOrigin}
                  onChange={(e) => setFiscalOrigin(e.target.value)}
                  options={fiscalOriginOptions}
                />
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Unidade fiscal</label>
                  <Input maxLength={6} placeholder="UN" value={fiscalUnit} onChange={(e) => setFiscalUnit(e.target.value.toUpperCase())} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">GTIN / Código de barras</label>
                  <Input inputMode="numeric" placeholder="8, 12, 13 ou 14 dígitos" value={gtin} onChange={(e) => setGtin(digitsOnly(e.target.value, 14))} />
                </div>
                {/* Checkbox for show_in_store */}
                <div className="flex items-center gap-2 md:col-span-2 pt-2 pb-1">
                  <input
                    type="checkbox"
                    id="showInStore"
                    checked={showInStore}
                    onChange={(e) => setShowInStore(e.target.checked)}
                    className="w-4 h-4 rounded border-brand-grey/25 bg-brand-input text-brand-red focus:ring-brand-red focus:ring-offset-brand-black"
                  />
                  <label htmlFor="showInStore" className="text-xs font-mono text-white cursor-pointer select-none uppercase tracking-wider">
                    Disponibilizar este produto na Loja Online
                  </label>
                </div>
                {/* Product Photo Upload Field */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Foto do Produto</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-brand-grey rounded px-3 py-2 focus:outline-none focus:border-brand-red cursor-pointer file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-[10px] file:font-mono file:font-bold file:uppercase file:bg-brand-red file:text-white file:hover:bg-brand-darkred file:cursor-pointer"
                  />
                  {imageFile && (
                    <p className="text-[10px] text-emerald-500 font-mono mt-1 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      Imagem selecionada: {imageFile.name}
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-6 border-t border-brand-grey/10">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancelarCadastro}
                >
                  Cancelar Cadastro
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSaving}
                >
                  {isSaving ? 'Salvando...' : 'Confirmar Cadastro'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* CENTER SCREEN SUCCESS BANNER */}
      {showSuccessOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-brand-card border border-emerald-500/35 p-8 rounded shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-500">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black tracking-wider uppercase text-emerald-500 leading-tight">
              PRODUTO CADASTRADO COM SUCESSO!
            </h3>
            <p className="text-[11px] text-brand-grey leading-normal">
              O formulário foi resetado. Você pode continuar cadastrando produtos.
            </p>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-3xl mx-4 relative p-6 space-y-6 max-h-[90vh] overflow-y-auto" withStripe>
            {/* Close Button (X) */}
            <button
              onClick={() => {
                setIsEditModalOpen(false);
                resetForm();
                setSelectedProduct(null);
              }}
              className="absolute top-4 right-4 text-brand-grey hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-lg font-black italic uppercase tracking-tight text-white">
                Editar Produto
              </h3>
              <p className="text-[10px] text-brand-grey font-mono uppercase tracking-widest mt-1">
                Altere as informações cadastrais do produto no sistema
              </p>
            </div>

            <form onSubmit={handleEditConfirm} className="space-y-4 text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Código (SKU)</label>
                  <Input
                    placeholder="Auto-gerado se vazio"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    disabled
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Locação de Estoque</label>
                  <Input
                    placeholder="Ex: Corredor D"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Nome do Produto</label>
                  <Input
                    placeholder="Ex: Pneu Pirelli Superbike Diablo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Marca</label>
                  <Input
                    placeholder="Ex: Pirelli"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Categoria</label>
                  <Input
                    placeholder="Ex: Pneus"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Preço de Venda (R$)</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Estoque Inicial (Qtd)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Estoque Mínimo (Qtd)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2 mt-2 border-t border-brand-grey/15 pt-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">Dados fiscais</h4>
                  <p className="mt-1 text-[10px] font-mono text-brand-grey">
                    Preencha conforme orientação do contador. Estes dados são necessários para emitir NFC-e.
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">NCM</label>
                  <Input inputMode="numeric" placeholder="8 dígitos" value={ncm} onChange={(e) => setNcm(digitsOnly(e.target.value, 8))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">CEST (quando aplicável)</label>
                  <Input inputMode="numeric" placeholder="7 dígitos" value={cest} onChange={(e) => setCest(digitsOnly(e.target.value, 7))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">CFOP padrão para NFC-e</label>
                  <Input inputMode="numeric" placeholder="4 dígitos" value={cfop} onChange={(e) => setCfop(digitsOnly(e.target.value, 4))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">CSOSN (Simples Nacional)</label>
                  <Input inputMode="numeric" placeholder="3 dígitos" value={csosn} onChange={(e) => setCsosn(digitsOnly(e.target.value, 3))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">CST ICMS (regime normal)</label>
                  <Input inputMode="numeric" placeholder="Deixe vazio no Simples" value={cst} onChange={(e) => setCst(digitsOnly(e.target.value, 2))} />
                </div>
                <Select
                  label="Origem da mercadoria"
                  value={fiscalOrigin}
                  onChange={(e) => setFiscalOrigin(e.target.value)}
                  options={fiscalOriginOptions}
                />
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Unidade fiscal</label>
                  <Input maxLength={6} placeholder="UN" value={fiscalUnit} onChange={(e) => setFiscalUnit(e.target.value.toUpperCase())} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">GTIN / Código de barras</label>
                  <Input inputMode="numeric" placeholder="8, 12, 13 ou 14 dígitos" value={gtin} onChange={(e) => setGtin(digitsOnly(e.target.value, 14))} />
                </div>
                {/* Checkbox for show_in_store */}
                <div className="flex items-center gap-2 md:col-span-2 pt-2 pb-1">
                  <input
                    type="checkbox"
                    id="showInStoreEdit"
                    checked={showInStore}
                    onChange={(e) => setShowInStore(e.target.checked)}
                    className="w-4 h-4 rounded border-brand-grey/25 bg-brand-input text-brand-red focus:ring-brand-red focus:ring-offset-brand-black"
                  />
                  <label htmlFor="showInStoreEdit" className="text-xs font-mono text-white cursor-pointer select-none uppercase tracking-wider">
                    Disponibilizar este produto na Loja Online
                  </label>
                </div>
                {/* Product Photo Upload Field */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Foto do Produto</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-brand-grey rounded px-3 py-2 focus:outline-none focus:border-brand-red cursor-pointer file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-[10px] file:font-mono file:font-bold file:uppercase file:bg-brand-red file:text-white file:hover:bg-brand-darkred file:cursor-pointer"
                  />
                  {imageFile && (
                    <p className="text-[10px] text-emerald-500 font-mono mt-1 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      Imagem selecionada: {imageFile.name}
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-6 border-t border-brand-grey/10">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    resetForm();
                    setSelectedProduct(null);
                  }}
                >
                  CANCELAR
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSaving}
                >
                  {isSaving ? 'Salvando...' : 'CONCLUIR'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* CENTER SCREEN EDIT SUCCESS BANNER */}
      {showEditSuccessOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-brand-card border border-emerald-500/35 p-8 rounded shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-500">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black tracking-wider uppercase text-emerald-500 leading-tight">
              PRODUTO EDITADO COM SUCESSO!
            </h3>
            <p className="text-[11px] text-brand-grey leading-normal">
              As alterações do produto foram salvas com sucesso no sistema.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
