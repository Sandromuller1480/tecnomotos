'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Check, ClipboardList, Eye, FileText, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import whatsappIcon from '../../../../inagens/ícone whatsapp.png';

type QuotationStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
type QuotationItemType = 'PRODUCT' | 'SERVICE';

interface CustomerOption {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  price: number;
}

interface QuotationItemForm {
  item_type: QuotationItemType;
  product_id: string;
  description: string;
  quantity: string;
  unit_price: string;
}

interface QuotationItem {
  id: string;
  item_type: QuotationItemType;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Quotation {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  title: string;
  vehicle_info: string | null;
  status: QuotationStatus;
  valid_until: string | null;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  notes: string | null;
  created_at: string;
  quotation_items?: QuotationItem[];
}

interface QuotationItemRow extends Omit<QuotationItem, 'quantity' | 'unit_price' | 'total_price'> {
  quantity: number | string | null;
  unit_price: number | string | null;
  total_price: number | string | null;
}

interface QuotationRow extends Omit<Quotation, 'subtotal' | 'discount_amount' | 'total_amount' | 'quotation_items'> {
  subtotal: number | string | null;
  discount_amount: number | string | null;
  total_amount: number | string | null;
  quotation_items?: QuotationItemRow[] | null;
}

interface CustomerProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  customers: { id: string } | { id: string }[] | null;
}

interface ProductRow extends Omit<ProductOption, 'price'> {
  price: number | string | null;
}

const statusLabels: Record<QuotationStatus, string> = {
  DRAFT: 'Rascunho',
  SENT: 'Enviado',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
  EXPIRED: 'Expirado'
};

const statusVariants: Record<QuotationStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  DRAFT: 'neutral',
  SENT: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'warning'
};

const emptyItem = (): QuotationItemForm => ({
  item_type: 'SERVICE',
  product_id: '',
  description: '',
  quantity: '1',
  unit_price: ''
});

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const getErrorMessage = (err: unknown, fallback: string) => err instanceof Error ? err.message : fallback;
const onlyDigits = (value: string | null | undefined) => (value || '').replace(/\D/g, '');

export default function AdminQuotationsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { success, error, info } = useToast();

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [canManageQuotations, setCanManageQuotations] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
  const [viewingQuotation, setViewingQuotation] = useState<Quotation | null>(null);
  const [quotationToDelete, setQuotationToDelete] = useState<Quotation | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [showDeleteSuccessOverlay, setShowDeleteSuccessOverlay] = useState(false);
  const [attachCustomer, setAttachCustomer] = useState(true);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [title, setTitle] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [status, setStatus] = useState<QuotationStatus>('DRAFT');
  const [discountAmount, setDiscountAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [generatePdf, setGeneratePdf] = useState(true);
  const [items, setItems] = useState<QuotationItemForm[]>([emptyItem()]);

  const fetchQuotations = async () => {
    const { data, error: fetchErr } = await supabase
      .from('quotations')
      .select(`
        id,
        customer_id,
        customer_name,
        customer_email,
        customer_phone,
        title,
        vehicle_info,
        status,
        valid_until,
        subtotal,
        discount_amount,
        total_amount,
        notes,
        created_at,
        quotation_items (
          id,
          item_type,
          product_id,
          description,
          quantity,
          unit_price,
          total_price
        )
      `)
      .order('created_at', { ascending: false });

    if (fetchErr) {
      const missingTable = fetchErr.message.includes('quotations');
      if (missingTable) {
        setQuotations([]);
        return;
      }
      throw fetchErr;
    }

    setQuotations(((data || []) as QuotationRow[]).map((quotation) => ({
      ...quotation,
      subtotal: parseFloat(String(quotation.subtotal)) || 0,
      discount_amount: parseFloat(String(quotation.discount_amount)) || 0,
      total_amount: parseFloat(String(quotation.total_amount)) || 0,
      quotation_items: (quotation.quotation_items || []).map((item) => ({
        ...item,
        quantity: parseFloat(String(item.quantity)) || 0,
        unit_price: parseFloat(String(item.unit_price)) || 0,
        total_price: parseFloat(String(item.total_price)) || 0
      }))
    })));
  };

  const fetchCustomers = async () => {
    const { data, error: fetchErr } = await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        email,
        phone,
        customers ( id )
      `)
      .order('full_name');

    if (fetchErr) throw fetchErr;

    setCustomers(((data || []) as CustomerProfileRow[])
      .filter((profile) => profile.customers)
      .map((profile) => ({
        id: profile.id,
        full_name: profile.full_name || 'Cliente sem nome',
        email: profile.email || '',
        phone: profile.phone || null
      })));
  };

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name, sku, price')
      .order('name', { ascending: true });

    setProducts(((data || []) as ProductRow[]).map((product) => ({
      ...product,
      price: parseFloat(String(product.price)) || 0
    })));
  };

  useEffect(() => {
    async function checkAuthAndLoad() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: hasView } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'orders.view'
      });

      if (!hasView) {
        router.push('/403');
        return;
      }

      const { data: hasCreate } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'orders.create'
      });

      const { data: isOwner } = await supabase.rpc('is_owner', {
        user_uuid: user.id
      });

      setCanCreate(Boolean(hasCreate));
      setCanManageQuotations(Boolean(isOwner));
      await Promise.all([fetchQuotations(), fetchCustomers(), fetchProducts()]);
      setIsLoading(false);

      if (window.location.search.includes('novo=1')) {
        setEditingQuotation(null);
        setIsCreateModalOpen(true);
      }
    }

    checkAuthAndLoad();
  }, []);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity.replace(',', '.')) || 0;
      const unitPrice = parseFloat(item.unit_price.replace(',', '.')) || 0;
      return sum + quantity * unitPrice;
    }, 0);
    const discount = Math.max(0, parseFloat(discountAmount.replace(',', '.')) || 0);
    return {
      subtotal,
      discount,
      total: Math.max(0, subtotal - discount)
    };
  }, [items, discountAmount]);

  const resetForm = () => {
    setAttachCustomer(true);
    setCustomerId('');
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setTitle('');
    setVehicleInfo('');
    setValidUntil('');
    setStatus('DRAFT');
    setDiscountAmount('');
    setNotes('');
    setGeneratePdf(true);
    setItems([emptyItem()]);
  };

  const openCreateModal = () => {
    setEditingQuotation(null);
    resetForm();
    setIsCreateModalOpen(true);
  };

  const openEditModal = (quotation: Quotation) => {
    setEditingQuotation(quotation);
    setAttachCustomer(Boolean(quotation.customer_id));
    setCustomerId(quotation.customer_id || '');
    setCustomerName(quotation.customer_name || '');
    setCustomerEmail(quotation.customer_email || '');
    setCustomerPhone(quotation.customer_phone || '');
    setTitle(quotation.title);
    setVehicleInfo(quotation.vehicle_info || '');
    setValidUntil(quotation.valid_until || '');
    setStatus(quotation.status);
    setDiscountAmount(String(quotation.discount_amount || ''));
    setNotes(quotation.notes || '');
    setGeneratePdf(true);
    setItems(
      quotation.quotation_items && quotation.quotation_items.length > 0
        ? quotation.quotation_items.map((item) => ({
            item_type: item.item_type,
            product_id: item.product_id || '',
            description: item.description,
            quantity: String(item.quantity),
            unit_price: String(item.unit_price)
          }))
        : [emptyItem()]
    );
    setIsCreateModalOpen(true);
  };

  const getPdfUrl = (quotationId: string) => `/api/orcamentos/${quotationId}/pdf`;

  const openQuotationPdf = (quotation: Quotation) => {
    window.open(getPdfUrl(quotation.id), '_blank', 'noopener,noreferrer');
  };

  const sendQuotationToWhatsapp = (quotation: Quotation) => {
    const phone = onlyDigits(quotation.customer_phone);
    const pdfUrl = `${window.location.origin}${getPdfUrl(quotation.id)}`;
    const message = `Olá${quotation.customer_name ? `, ${quotation.customer_name}` : ''}! Segue o orçamento ${quotation.title} em PDF: ${pdfUrl}`;
    const whatsappUrl = phone
      ? `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const updateItem = (index: number, patch: Partial<QuotationItemForm>) => {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, ...patch };
      if (patch.product_id) {
        const product = products.find((option) => option.id === patch.product_id);
        if (product) {
          next.item_type = 'PRODUCT';
          next.description = product.name;
          next.unit_price = String(product.price);
        }
      }
      return next;
    }));
  };

  const addItem = () => setItems((current) => [...current, emptyItem()]);
  const removeItem = (index: number) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));

  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  const handleSaveQuotation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingQuotation && !canCreate) {
      error('Sem permissão', 'Você não tem permissão para criar orçamentos.');
      return;
    }

    if (editingQuotation && !canManageQuotations) {
      error('Sem permissão', 'Você não tem permissão para editar orçamentos.');
      return;
    }

    const cleanItems = items
      .map((item) => {
        const quantity = parseFloat(item.quantity.replace(',', '.')) || 0;
        const unitPrice = parseFloat(item.unit_price.replace(',', '.')) || 0;
        return {
          item_type: item.item_type,
          product_id: item.product_id || null,
          description: item.description.trim(),
          quantity,
          unit_price: unitPrice,
          total_price: quantity * unitPrice
        };
      })
      .filter((item) => item.description && item.quantity > 0);

    if (cleanItems.length === 0) {
      error('Itens obrigatórios', 'Adicione pelo menos um produto ou serviço ao orçamento.');
      return;
    }

    setIsSaving(true);
    try {
      const customerPayload = attachCustomer && selectedCustomer
        ? {
            customer_id: selectedCustomer.id,
            customer_name: selectedCustomer.full_name,
            customer_email: selectedCustomer.email || null,
            customer_phone: selectedCustomer.phone || null
          }
        : {
            customer_id: null,
            customer_name: customerName.trim() || null,
            customer_email: customerEmail.trim() || null,
            customer_phone: customerPhone.trim() || null
          };

      let quotationId = editingQuotation?.id;

      if (editingQuotation) {
        const { error: updateErr } = await supabase
          .from('quotations')
          .update({
            ...customerPayload,
            title: title.trim(),
            vehicle_info: vehicleInfo.trim() || null,
            status,
            valid_until: validUntil || null,
            subtotal: totals.subtotal,
            discount_amount: totals.discount,
            total_amount: totals.total,
            notes: notes.trim() || null
          })
          .eq('id', editingQuotation.id);

        if (updateErr) throw updateErr;

        const { error: deleteItemsErr } = await supabase
          .from('quotation_items')
          .delete()
          .eq('quotation_id', editingQuotation.id);

        if (deleteItemsErr) throw deleteItemsErr;
      } else {
        const { data: insertedQuotation, error: insertErr } = await supabase
          .from('quotations')
          .insert({
            ...customerPayload,
            title: title.trim(),
            vehicle_info: vehicleInfo.trim() || null,
            status,
            valid_until: validUntil || null,
            subtotal: totals.subtotal,
            discount_amount: totals.discount,
            total_amount: totals.total,
            notes: notes.trim() || null
          })
          .select('id')
          .single();

        if (insertErr) throw insertErr;
        quotationId = insertedQuotation.id;
      }

      if (!quotationId) {
        throw new Error('Falha ao identificar o orçamento.');
      }

      const { error: itemErr } = await supabase
        .from('quotation_items')
        .insert(cleanItems.map((item) => ({
          quotation_id: quotationId,
          ...item
        })));

      if (itemErr) throw itemErr;

      await fetchQuotations();
      setIsCreateModalOpen(false);
      setEditingQuotation(null);
      if (generatePdf) {
        window.open(getPdfUrl(quotationId), '_blank', 'noopener,noreferrer');
      }
      resetForm();
      setShowSuccessOverlay(true);
      success('Orçamento gerado', 'O orçamento foi salvo no banco de dados.');
      window.setTimeout(() => setShowSuccessOverlay(false), 2200);
    } catch (err: unknown) {
      error('Erro ao gerar orçamento', getErrorMessage(err, 'Não foi possível salvar o orçamento.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteQuotation = async () => {
    if (!quotationToDelete) return;
    setIsDeleting(true);

    try {
      const { error: deleteErr } = await supabase
        .from('quotations')
        .delete()
        .eq('id', quotationToDelete.id);

      if (deleteErr) throw deleteErr;

      setQuotations((current) => current.filter((quotation) => quotation.id !== quotationToDelete.id));
      setQuotationToDelete(null);
      setShowDeleteSuccessOverlay(true);
      window.setTimeout(() => setShowDeleteSuccessOverlay(false), 2400);
    } catch (err: unknown) {
      error('Erro ao deletar orçamento', getErrorMessage(err, 'Não foi possível deletar o orçamento.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredQuotations = quotations.filter((quotation) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query || (
      quotation.title.toLowerCase().includes(query) ||
      (quotation.customer_name || '').toLowerCase().includes(query) ||
      (quotation.customer_email || '').toLowerCase().includes(query) ||
      (quotation.vehicle_info || '').toLowerCase().includes(query)
    );
    const matchesStatus = statusFilter === 'ALL' || quotation.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 text-left">
      <div>
        <Breadcrumb items={[{ label: 'Comercial' }, { label: 'Orcamentos' }]} />
        <div className="flex justify-between items-center mt-2 border-b border-brand-grey/15 pb-4">
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
              Orcamentos
            </h1>
            <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
              Gere propostas para clientes cadastrados ou atendimentos avulsos
            </p>
          </div>
          <Button size="sm" onClick={openCreateModal} disabled={!canCreate}>
            <Plus className="w-4 h-4" /> Novo Orçamento
          </Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative w-full max-w-md">
            <Input
              placeholder="Buscar por cliente, veículo ou descrição..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-9 text-xs font-mono bg-brand-input"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey/60 pointer-events-none z-10" />
          </div>

          <div className="flex bg-brand-black p-1 border border-brand-grey/10 rounded font-mono text-[10px] uppercase">
            {[
              { id: 'ALL', label: 'Todos' },
              { id: 'DRAFT', label: 'Rascunho' },
              { id: 'SENT', label: 'Enviado' },
              { id: 'APPROVED', label: 'Aprovado' },
              { id: 'REJECTED', label: 'Recusado' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded transition-colors ${statusFilter === tab.id ? 'bg-brand-red text-white font-bold' : 'text-brand-grey hover:text-white'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : filteredQuotations.length === 0 ? (
          <div className="py-16 text-center text-brand-grey">
            <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <h3 className="text-sm font-black uppercase tracking-wider text-white">Nenhum orçamento registrado</h3>
            <p className="text-xs mt-2">Os orcamentos gerados aparecerao estruturados aqui.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Orçamento</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQuotations.map((quotation) => (
                <TableRow key={quotation.id}>
                  <TableCell>
                    <div className="font-black text-white uppercase">{quotation.title}</div>
                    <div className="text-[10px] font-mono text-brand-grey">#{quotation.id.slice(0, 8).toUpperCase()}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-brand-silver">{quotation.customer_name || 'Sem cliente anexado'}</div>
                    <div className="text-[10px] font-mono text-brand-grey">{quotation.customer_email || quotation.customer_phone || '-'}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-brand-grey">{quotation.vehicle_info || '-'}</TableCell>
                  <TableCell className="font-mono text-sm text-white">{money(quotation.total_amount)}</TableCell>
                  <TableCell><Badge variant={statusVariants[quotation.status]}>{statusLabels[quotation.status]}</Badge></TableCell>
                  <TableCell className="font-mono text-xs text-brand-grey">
                    {quotation.valid_until ? new Date(`${quotation.valid_until}T00:00:00`).toLocaleDateString('pt-BR') : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setViewingQuotation(quotation)}
                        title="Visualizar orcamento"
                        className="inline-flex h-9 w-9 items-center justify-center border border-brand-grey/25 bg-brand-black text-brand-grey transition-colors hover:border-brand-red hover:text-white"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openQuotationPdf(quotation)}
                        title="Abrir PDF do orcamento"
                        className="inline-flex h-9 w-9 items-center justify-center border border-brand-grey/25 bg-brand-black text-brand-grey transition-colors hover:border-brand-red hover:text-white"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => sendQuotationToWhatsapp(quotation)}
                        title="Enviar orcamento por WhatsApp"
                        className="inline-flex h-9 w-9 items-center justify-center border border-brand-grey/25 bg-brand-black transition-colors hover:border-[#25D366]"
                      >
                        <Image src={whatsappIcon} alt="" className="h-4 w-4 object-contain" />
                      </button>
                      {canManageQuotations && (
                        <>
                        <button
                          type="button"
                          onClick={() => openEditModal(quotation)}
                          title="Editar orcamento"
                          className="inline-flex h-9 w-9 items-center justify-center border border-brand-grey/25 bg-brand-black text-brand-grey transition-colors hover:border-brand-red hover:text-white"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuotationToDelete(quotation)}
                          title="Deletar orcamento"
                          className="inline-flex h-9 w-9 items-center justify-center border border-brand-grey/25 bg-brand-black text-brand-grey transition-colors hover:border-brand-red hover:text-brand-red"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {viewingQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-4xl mx-4 relative p-6 space-y-6 max-h-[90vh] overflow-y-auto" withStripe>
            <button
              type="button"
              onClick={() => setViewingQuotation(null)}
              className="absolute top-4 right-4 text-brand-grey hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="pr-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black italic uppercase tracking-tight text-white">
                    {viewingQuotation.title}
                  </h3>
                  <p className="text-[10px] text-brand-grey font-mono uppercase tracking-widest mt-1">
                    #{viewingQuotation.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>
                <Badge variant={statusVariants[viewingQuotation.status]}>
                  {statusLabels[viewingQuotation.status]}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-brand-grey/15 bg-brand-black/50 p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-brand-grey">Cliente</p>
                <p className="mt-2 text-sm font-bold text-white">{viewingQuotation.customer_name || 'Sem cliente anexado'}</p>
                <p className="mt-1 text-[11px] font-mono text-brand-grey">{viewingQuotation.customer_email || viewingQuotation.customer_phone || '-'}</p>
              </div>
              <div className="border border-brand-grey/15 bg-brand-black/50 p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-brand-grey">Veiculo</p>
                <p className="mt-2 text-sm font-bold text-white">{viewingQuotation.vehicle_info || '-'}</p>
              </div>
              <div className="border border-brand-grey/15 bg-brand-black/50 p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-brand-grey">Validade</p>
                <p className="mt-2 text-sm font-bold text-white">
                  {viewingQuotation.valid_until ? new Date(`${viewingQuotation.valid_until}T00:00:00`).toLocaleDateString('pt-BR') : '-'}
                </p>
              </div>
            </div>

            <div className="border border-brand-grey/15">
              <div className="grid grid-cols-[1fr_90px_120px_120px] gap-3 border-b border-brand-grey/15 bg-brand-black/60 px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-brand-grey">
                <span>Item</span>
                <span className="text-right">Qtd</span>
                <span className="text-right">Unitario</span>
                <span className="text-right">Total</span>
              </div>
              {(viewingQuotation.quotation_items || []).length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-brand-grey">Nenhum item registrado.</div>
              ) : (
                <div className="divide-y divide-brand-grey/10">
                  {(viewingQuotation.quotation_items || []).map((item) => (
                    <div key={item.id} className="grid grid-cols-[1fr_90px_120px_120px] gap-3 px-4 py-3 text-xs">
                      <div>
                        <p className="font-bold text-white">{item.description}</p>
                        <p className="mt-1 text-[10px] font-mono uppercase text-brand-grey">{item.item_type === 'PRODUCT' ? 'Produto' : 'Servico'}</p>
                      </div>
                      <span className="text-right font-mono text-brand-silver">{item.quantity}</span>
                      <span className="text-right font-mono text-brand-silver">{money(item.unit_price)}</span>
                      <span className="text-right font-mono font-bold text-white">{money(item.total_price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4">
              <div className="border border-brand-grey/15 bg-brand-black/50 p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-brand-grey">Observacoes</p>
                <p className="mt-2 text-xs leading-relaxed text-brand-silver">{viewingQuotation.notes || '-'}</p>
              </div>
              <div className="border border-brand-grey/15 bg-brand-black/60 p-4 space-y-3 font-mono text-xs">
                <div className="flex justify-between text-brand-grey"><span>Subtotal</span><span>{money(viewingQuotation.subtotal)}</span></div>
                <div className="flex justify-between text-brand-grey"><span>Desconto</span><span>{money(viewingQuotation.discount_amount)}</span></div>
                <div className="flex justify-between text-white text-base font-black border-t border-brand-grey/15 pt-3"><span>Total</span><span>{money(viewingQuotation.total_amount)}</span></div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-brand-grey/10 pt-5">
              <Button type="button" variant="secondary" onClick={() => openQuotationPdf(viewingQuotation)}>
                <FileText className="w-4 h-4" /> Abrir PDF
              </Button>
              <button
                type="button"
                onClick={() => sendQuotationToWhatsapp(viewingQuotation)}
                className="inline-flex items-center justify-center gap-2 border border-[#25D366]/50 bg-brand-darkgrey px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-white transition-all duration-200 skew-x-[-6deg] hover:border-[#25D366] hover:bg-[#25D366]/10"
              >
                <span className="skew-x-[6deg] inline-flex items-center gap-2">
                  <Image src={whatsappIcon} alt="" className="h-4 w-4 object-contain" />
                  WhatsApp
                </span>
              </button>
              <Button type="button" variant="secondary" onClick={() => setViewingQuotation(null)}>
                Fechar
              </Button>
            </div>
          </Card>
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-4xl mx-4 relative p-6 space-y-6 max-h-[90vh] overflow-y-auto" withStripe>
            <button
              onClick={() => {
                setIsCreateModalOpen(false);
                setEditingQuotation(null);
                resetForm();
              }}
              className="absolute top-4 right-4 text-brand-grey hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4 pr-8">
              <div>
                <h3 className="text-lg font-black italic uppercase tracking-tight text-white">
                  {editingQuotation ? 'Editar Orcamento' : 'Gerar Orcamento'}
                </h3>
                <p className="text-[10px] text-brand-grey font-mono uppercase tracking-widest mt-1">
                  Monte uma proposta com cliente cadastrado ou atendimento avulso
                </p>
              </div>
              {editingQuotation && (
                <button
                  type="button"
                  onClick={() => sendQuotationToWhatsapp(editingQuotation)}
                  className="inline-flex h-10 items-center justify-center gap-2 border border-[#25D366]/50 bg-brand-black px-4 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:border-[#25D366] hover:bg-[#25D366]/10"
                >
                  <Image src={whatsappIcon} alt="" className="h-4 w-4 object-contain" />
                  WhatsApp
                </button>
              )}
            </div>

            <form onSubmit={handleSaveQuotation} className="space-y-5 text-left">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAttachCustomer(true)}
                  className={`px-3 py-2 text-[10px] font-mono uppercase border transition-colors ${attachCustomer ? 'bg-brand-red border-brand-red text-white' : 'border-brand-grey/25 text-brand-grey hover:text-white'}`}
                >
                  Anexar cliente cadastrado
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAttachCustomer(false);
                    setCustomerId('');
                  }}
                  className={`px-3 py-2 text-[10px] font-mono uppercase border transition-colors ${!attachCustomer ? 'bg-brand-red border-brand-red text-white' : 'border-brand-grey/25 text-brand-grey hover:text-white'}`}
                >
                  Orçamento sem cliente
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {attachCustomer ? (
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Cliente cadastrado</label>
                    <select
                      value={customerId}
                      onChange={(event) => setCustomerId(event.target.value)}
                      className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                      required={attachCustomer}
                    >
                      <option value="">Selecione o cliente</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customer.full_name} - {customer.email}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-brand-grey uppercase">Nome do cliente</label>
                      <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Opcional" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-brand-grey uppercase">Contato / WhatsApp</label>
                      <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Opcional" />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] font-mono text-brand-grey uppercase">E-mail</label>
                      <Input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="Opcional" />
                    </div>
                  </>
                )}

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Título do orçamento</label>
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex: Revisao geral Fazer 250" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Motocicleta / Placa</label>
                  <Input value={vehicleInfo} onChange={(event) => setVehicleInfo(event.target.value)} placeholder="Ex: Yamaha FZ15 - SQD5E90" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Validade</label>
                  <Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Status</label>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as QuotationStatus)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                  >
                    <option value="DRAFT">Rascunho</option>
                    <option value="SENT">Enviado</option>
                    <option value="APPROVED">Aprovado</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Desconto R$</label>
                  <Input inputMode="decimal" value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} placeholder="0,00" />
                </div>
                <label className="md:col-span-2 flex items-center gap-3 border border-brand-grey/15 bg-brand-black/50 p-3 text-xs font-mono uppercase tracking-wider text-white">
                  <input
                    type="checkbox"
                    checked={generatePdf}
                    onChange={(event) => setGeneratePdf(event.target.checked)}
                    className="h-4 w-4 accent-brand-red"
                  />
                  Gerar PDF do orcamento ao salvar
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-brand-grey/10 pb-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-brand-red">Itens do orçamento</h4>
                  <Button type="button" size="sm" variant="secondary" onClick={addItem}>
                    <Plus className="w-3.5 h-3.5" /> Adicionar Item
                  </Button>
                </div>

                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 lg:grid-cols-[130px_1fr_90px_120px_40px] gap-3 border border-brand-grey/15 bg-brand-input/40 p-3">
                      <select
                        value={item.item_type}
                        onChange={(event) => updateItem(index, { item_type: event.target.value as QuotationItemType, product_id: '' })}
                        className="text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                      >
                        <option value="SERVICE">Serviço</option>
                        <option value="PRODUCT">Produto</option>
                      </select>
                      {item.item_type === 'PRODUCT' ? (
                        <select
                          value={item.product_id}
                          onChange={(event) => updateItem(index, { product_id: event.target.value })}
                          className="text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                        >
                          <option value="">Selecione um produto</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>{product.name} - {money(product.price)}</option>
                          ))}
                        </select>
                      ) : (
                        <Input value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} placeholder="Descrição do serviço" required />
                      )}
                      <Input inputMode="decimal" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} placeholder="Qtd" required />
                      <Input inputMode="decimal" value={item.unit_price} onChange={(event) => updateItem(index, { unit_price: event.target.value })} placeholder="Valor" required />
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        disabled={items.length === 1}
                        className="h-10 border border-brand-grey/25 text-brand-grey hover:text-brand-red disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4 mx-auto" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Observacoes</label>
                  <textarea
                    rows={4}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                    placeholder="Condições, prazo de execucao, garantia ou observacoes internas..."
                  />
                </div>
                <div className="border border-brand-grey/15 bg-brand-black/60 p-4 space-y-3 font-mono text-xs">
                  <div className="flex justify-between text-brand-grey"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
                  <div className="flex justify-between text-brand-grey"><span>Desconto</span><span>{money(totals.discount)}</span></div>
                  <div className="flex justify-between text-white text-base font-black border-t border-brand-grey/15 pt-3"><span>Total</span><span>{money(totals.total)}</span></div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-brand-grey/10">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setEditingQuotation(null);
                    resetForm();
                    info('Orçamento cancelado', 'Nenhum orçamento foi registrado.');
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Salvando...' : editingQuotation ? 'Atualizar Orcamento' : 'Salvar Orcamento'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {showSuccessOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-brand-card border border-emerald-500/35 p-8 rounded shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-500">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black tracking-wider uppercase text-emerald-500 leading-tight">
              ORCAMENTO GERADO COM SUCESSO!
            </h3>
            <p className="text-[11px] text-brand-grey leading-normal">
              A proposta foi registrada no banco de dados.
            </p>
          </div>
        </div>
      )}

      {quotationToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-md mx-4 p-7 space-y-6 text-center" withStripe>
            <div className="mx-auto flex h-12 w-12 items-center justify-center border border-brand-red/40 bg-brand-red/10 text-brand-red">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="text-base font-black uppercase tracking-wider text-white leading-tight">
              TEM CERTEZA QUE DESEJA DELETAR ESTE ORÇAMENTO?
            </h3>
            <div className="flex justify-center gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setQuotationToDelete(null)}
                disabled={isDeleting}
              >
                CANCELAR
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDeleteQuotation}
                disabled={isDeleting}
              >
                {isDeleting ? 'DELETANDO...' : 'DELETAR'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showDeleteSuccessOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-brand-card border border-emerald-500/35 p-8 rounded shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-500">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black tracking-wider uppercase text-emerald-500 leading-tight">
              ORÇAMENTO DELETADO COM SUCESSO!
            </h3>
          </div>
        </div>
      )}
    </div>
  );
}
