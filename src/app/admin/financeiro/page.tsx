'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  Clock,
  DollarSign,
  Plus,
  Search,
  TrendingDown,
  TrendingUp,
  X
} from 'lucide-react';

type FinancialType = 'INCOME' | 'EXPENSE';
type FinancialStatus = 'PENDING' | 'PAID' | 'CANCELLED';
type FinancialSource = 'MANUAL' | 'ORDER' | 'SERVICE_ORDER' | 'INVENTORY' | 'FISCAL';

interface FinancialEntry {
  id: string;
  type: FinancialType;
  status: FinancialStatus;
  category: string;
  description: string;
  amount: number;
  payment_method: string | null;
  due_date: string | null;
  paid_at: string | null;
  source: FinancialSource;
  source_id: string | null;
  notes: string | null;
  created_at: string;
  isAutomatic?: boolean;
}

interface OrderRow {
  id: string;
  customer_email: string;
  customer_name: string | null;
  status: string;
  total_amount: number | string;
  payment_date: string | null;
  created_at: string;
  sales_channel: 'ONLINE' | 'COUNTER';
  payment_method: string | null;
}

interface ServiceOrderRow {
  id: string;
  service_type: string;
  status: string;
  total_price: number | string;
  created_at: string;
}

const statusLabels: Record<FinancialStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  CANCELLED: 'Cancelado'
};

const sourceLabels: Record<FinancialSource, string> = {
  MANUAL: 'Manual',
  ORDER: 'Pedido',
  SERVICE_ORDER: 'Ordem de Serviço',
  INVENTORY: 'Estoque',
  FISCAL: 'Fiscal'
};

export default function AdminFinancialPage() {
  const router = useRouter();
  const supabase = createClient();
  const { success, error, info } = useToast();

  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [canUpdate, setCanUpdate] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [entryType, setEntryType] = useState<FinancialType>('INCOME');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [entryStatus, setEntryStatus] = useState<FinancialStatus>('PENDING');
  const [notes, setNotes] = useState('');

  const buildAutomaticEntries = (orders: OrderRow[], serviceOrders: ServiceOrderRow[]) => {
    const orderEntries: FinancialEntry[] = orders
      .filter((order) => order.status === 'paid')
      .map((order) => ({
        id: `order-${order.id}`,
        type: 'INCOME',
        status: 'PAID',
        category: order.sales_channel === 'COUNTER' ? 'Venda de Balcão' : 'Venda Online',
        description: `Pedido #${order.id.slice(0, 8).toUpperCase()} - ${order.customer_name || order.customer_email}`,
        amount: parseFloat(String(order.total_amount)) || 0,
        payment_method: order.payment_method || (order.sales_channel === 'ONLINE' ? 'Stripe' : null),
        due_date: null,
        paid_at: order.payment_date || order.created_at,
        source: 'ORDER',
        source_id: order.id,
        notes: null,
        created_at: order.created_at,
        isAutomatic: true
      }));

    const serviceEntries: FinancialEntry[] = serviceOrders
      .filter((order) => order.status === 'COMPLETED' && (parseFloat(String(order.total_price)) || 0) > 0)
      .map((order) => ({
        id: `service-${order.id}`,
        type: 'INCOME',
        status: 'PAID',
        category: 'Serviço de Oficina',
        description: `OS #${order.id.slice(0, 8).toUpperCase()} - ${order.service_type}`,
        amount: parseFloat(String(order.total_price)) || 0,
        payment_method: 'Oficina',
        due_date: null,
        paid_at: order.created_at,
        source: 'SERVICE_ORDER',
        source_id: order.id,
        notes: null,
        created_at: order.created_at,
        isAutomatic: true
      }));

    return [...orderEntries, ...serviceEntries];
  };

  const fetchFinancialData = async () => {
    setIsLoading(true);
    try {
      const manualEntries: FinancialEntry[] = [];

      const manualRes = await supabase
        .from('financial_transactions')
        .select('id, type, status, category, description, amount, payment_method, due_date, paid_at, source, source_id, notes, created_at')
        .order('created_at', { ascending: false });

      if (manualRes.error) {
        const missingTable = manualRes.error.message.includes('financial_transactions');
        if (!missingTable) throw manualRes.error;
      } else {
        manualEntries.push(...(manualRes.data || []).map((entry: any) => ({
          ...entry,
          amount: parseFloat(entry.amount) || 0,
          isAutomatic: false
        })));
      }

      const { data: orders, error: ordersErr } = await supabase
        .from('orders')
        .select('id, customer_email, customer_name, status, total_amount, payment_date, created_at, sales_channel, payment_method')
        .eq('status', 'paid')
        .order('created_at', { ascending: false });

      if (ordersErr) throw ordersErr;

      const { data: serviceOrders, error: serviceErr } = await supabase
        .from('service_orders')
        .select('id, service_type, status, total_price, created_at')
        .eq('status', 'COMPLETED')
        .order('created_at', { ascending: false });

      if (serviceErr) throw serviceErr;

      const automaticEntries = buildAutomaticEntries((orders || []) as OrderRow[], (serviceOrders || []) as ServiceOrderRow[]);
      const combined = [...manualEntries, ...automaticEntries].sort((a, b) => (
        new Date(b.paid_at || b.due_date || b.created_at).getTime() - new Date(a.paid_at || a.due_date || a.created_at).getTime()
      ));

      setEntries(combined);
    } catch (err: any) {
      error('Erro ao carregar financeiro', err.message || 'Falha ao buscar o fluxo de caixa.');
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

      const { data: hasView } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'financial.view'
      });

      if (!hasView) {
        router.push('/403');
        return;
      }

      const [{ data: hasCreate }, { data: hasUpdate }] = await Promise.all([
        supabase.rpc('has_permission', { user_uuid: user.id, required_permission: 'financial.create' }),
        supabase.rpc('has_permission', { user_uuid: user.id, required_permission: 'financial.update' })
      ]);

      setCanCreate(!!hasCreate);
      setCanUpdate(!!hasUpdate);
      await fetchFinancialData();
    }

    checkAuthAndLoad();
  }, []);

  const resetForm = () => {
    setEntryType('INCOME');
    setCategory('');
    setDescription('');
    setAmount('');
    setPaymentMethod('');
    setDueDate('');
    setEntryStatus('PENDING');
    setNotes('');
  };

  const handleCreateEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!category || !description || !amount) {
      error('Campos Obrigatórios', 'Categoria, descrição e valor são necessários.');
      return;
    }

    setIsSaving(true);
    try {
      const paidAt = entryStatus === 'PAID' ? new Date().toISOString() : null;
      const { error: insertErr } = await supabase
        .from('financial_transactions')
        .insert({
          type: entryType,
          status: entryStatus,
          category,
          description,
          amount: parseFloat(amount) || 0,
          payment_method: paymentMethod || null,
          due_date: dueDate || null,
          paid_at: paidAt,
          source: 'MANUAL',
          notes: notes || null
        });

      if (insertErr) throw insertErr;

      resetForm();
      setIsCreateModalOpen(false);
      setShowSuccessOverlay(true);
      setTimeout(() => setShowSuccessOverlay(false), 2500);
      await fetchFinancialData();
    } catch (err: any) {
      error('Erro ao salvar', err.message || 'Falha ao registrar lançamento financeiro.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateEntryStatus = async (entry: FinancialEntry, nextStatus: FinancialStatus) => {
    if (entry.isAutomatic) return;

    try {
      const { error: updateErr } = await supabase
        .from('financial_transactions')
        .update({
          status: nextStatus,
          paid_at: nextStatus === 'PAID' ? new Date().toISOString() : null
        })
        .eq('id', entry.id);

      if (updateErr) throw updateErr;

      success('Financeiro Atualizado', `Lancamento marcado como ${statusLabels[nextStatus]}.`);
      await fetchFinancialData();
    } catch (err: any) {
      error('Erro ao atualizar', err.message);
    }
  };

  const filteredEntries = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return entries.filter((entry) => {
      const matchesSearch = !query || (
        entry.description.toLowerCase().includes(query) ||
        entry.category.toLowerCase().includes(query) ||
        (entry.payment_method || '').toLowerCase().includes(query) ||
        sourceLabels[entry.source].toLowerCase().includes(query)
      );
      const matchesType = typeFilter === 'ALL' || entry.type === typeFilter;
      const matchesStatus = statusFilter === 'ALL' || entry.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [entries, searchQuery, typeFilter, statusFilter]);

  const paidIncome = entries
    .filter((entry) => entry.type === 'INCOME' && entry.status === 'PAID')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const paidExpense = entries
    .filter((entry) => entry.type === 'EXPENSE' && entry.status === 'PAID')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const pendingIncome = entries
    .filter((entry) => entry.type === 'INCOME' && entry.status === 'PENDING')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const pendingExpense = entries
    .filter((entry) => entry.type === 'EXPENSE' && entry.status === 'PENDING')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const formatMoney = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6 text-left">
      <div>
        <Breadcrumb items={[{ label: 'Financeiro' }, { label: 'Fluxo de Caixa' }]} />
        <div className="flex justify-between items-center mt-2 border-b border-brand-grey/15 pb-4">
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
              Controle Financeiro
            </h1>
            <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
              Gerencie fluxo de caixa, contas a pagar e contas a receber
            </p>
          </div>
          {canCreate ? (
            <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Novo Lancamento
            </Button>
          ) : (
            <Badge variant="neutral">Financeiro</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between text-brand-grey">
            <span className="text-[10px] font-mono uppercase tracking-widest">Recebido</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-1">{formatMoney(paidIncome)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-brand-grey">
            <span className="text-[10px] font-mono uppercase tracking-widest">Pago</span>
            <TrendingDown className="w-4 h-4 text-brand-red" />
          </div>
          <div className="text-2xl font-black text-brand-red mt-1">{formatMoney(paidExpense)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-brand-grey">
            <span className="text-[10px] font-mono uppercase tracking-widest">Saldo</span>
            <DollarSign className="w-4 h-4 text-white" />
          </div>
          <div className="text-2xl font-black text-white mt-1">{formatMoney(paidIncome - paidExpense)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-brand-grey">
            <span className="text-[10px] font-mono uppercase tracking-widest">Pendentes</span>
            <Clock className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-2xl font-black text-yellow-400 mt-1">{formatMoney(pendingIncome - pendingExpense)}</div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="relative w-full max-w-sm">
            <Input
              placeholder="Buscar por descrição, categoria ou origem..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs font-mono bg-brand-input"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey/60 pointer-events-none z-10" />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex bg-brand-black p-1 border border-brand-grey/10 rounded font-mono text-[10px] uppercase">
              {[
                { id: 'ALL', label: 'Todos' },
                { id: 'INCOME', label: 'Receitas' },
                { id: 'EXPENSE', label: 'Despesas' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setTypeFilter(tab.id)}
                  className={`px-3 py-1.5 rounded transition-colors ${typeFilter === tab.id ? 'bg-brand-red text-white font-bold' : 'text-brand-grey hover:text-white'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex bg-brand-black p-1 border border-brand-grey/10 rounded font-mono text-[10px] uppercase">
              {[
                { id: 'ALL', label: 'Status' },
                { id: 'PENDING', label: 'Pendente' },
                { id: 'PAID', label: 'Pago' },
                { id: 'CANCELLED', label: 'Cancelado' }
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
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-brand-grey/15">
            <div className="mx-auto w-14 h-14 rounded-full bg-brand-black border border-brand-grey/10 flex items-center justify-center text-brand-grey mb-4">
              <DollarSign className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">
              Nenhum registro financeiro
            </h3>
            <p className="text-xs text-brand-grey mt-2">
              Cadastre lançamentos ou conclua vendas e ordens de serviço para alimentar o fluxo de caixa.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEntries.map((entry) => (
              <div key={entry.id} className="border border-brand-grey/15 bg-brand-input/40 p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`mt-0.5 ${entry.type === 'INCOME' ? 'text-emerald-400' : 'text-brand-red'}`}>
                    {entry.type === 'INCOME' ? <ArrowUpCircle className="w-5 h-5" /> : <ArrowDownCircle className="w-5 h-5" />}
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-white uppercase">{entry.description}</span>
                      <Badge variant="neutral" className="text-[9px]">{entry.category}</Badge>
                      <Badge variant="neutral" className="text-[9px]">{sourceLabels[entry.source]}</Badge>
                      {entry.isAutomatic && <Badge variant="info" className="text-[9px]">Automatico</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-mono text-brand-grey">
                      <span>Criado: {new Date(entry.created_at).toLocaleDateString('pt-BR')}</span>
                      {entry.due_date && <span>Vencimento: {new Date(entry.due_date).toLocaleDateString('pt-BR')}</span>}
                      {entry.paid_at && <span>Pagamento: {new Date(entry.paid_at).toLocaleString('pt-BR')}</span>}
                      <span>{entry.payment_method || '-'}</span>
                    </div>
                    {entry.notes && <p className="text-xs text-brand-silver">{entry.notes}</p>}
                  </div>
                </div>

                <div className="flex flex-wrap xl:flex-col items-end gap-2">
                  <span className={`text-lg font-black font-mono ${entry.type === 'INCOME' ? 'text-emerald-400' : 'text-brand-red'}`}>
                    {entry.type === 'INCOME' ? '+' : '-'} {formatMoney(entry.amount)}
                  </span>
                  {entry.status === 'PENDING' && <Badge variant="warning">{statusLabels[entry.status]}</Badge>}
                  {entry.status === 'PAID' && <Badge variant="success">{statusLabels[entry.status]}</Badge>}
                  {entry.status === 'CANCELLED' && <Badge variant="danger">{statusLabels[entry.status]}</Badge>}
                  {canUpdate && !entry.isAutomatic && entry.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => updateEntryStatus(entry, 'PAID')}>
                        <Check className="w-3.5 h-3.5" /> Pagar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => updateEntryStatus(entry, 'CANCELLED')}>
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-2xl mx-4 relative p-6 space-y-6 max-h-[90vh] overflow-y-auto" withStripe>
            <button
              onClick={() => {
                setIsCreateModalOpen(false);
                resetForm();
              }}
              className="absolute top-4 right-4 text-brand-grey hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-lg font-black italic uppercase tracking-tight text-white">
                Novo Lancamento Financeiro
              </h3>
              <p className="text-[10px] text-brand-grey font-mono uppercase tracking-widest mt-1">
                Registre contas a pagar, contas a receber, custos e entradas de caixa
              </p>
            </div>

            <form onSubmit={handleCreateEntry} className="space-y-4 text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Tipo</label>
                  <select
                    value={entryType}
                    onChange={(e) => setEntryType(e.target.value as FinancialType)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                  >
                    <option value="INCOME">Receita / Conta a receber</option>
                    <option value="EXPENSE">Despesa / Conta a pagar</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Status</label>
                  <select
                    value={entryStatus}
                    onChange={(e) => setEntryStatus(e.target.value as FinancialStatus)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                  >
                    <option value="PENDING">Pendente</option>
                    <option value="PAID">Pago</option>
                    <option value="CANCELLED">Cancelado</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Categoria</label>
                  <Input
                    placeholder="Ex: Aluguel, fornecedor, venda, oficina"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Valor</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Descrição</label>
                  <Input
                    placeholder="Ex: Pagamento de fornecedor de pecas"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Forma de Pagamento</label>
                  <Input
                    placeholder="Ex: Pix, dinheiro, cartao, boleto"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Vencimento</label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Observacoes</label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-brand-grey/10">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    resetForm();
                    info('Lancamento cancelado', 'Nenhum registro financeiro foi salvo.');
                  }}
                >
                  CANCELAR
                </Button>
                <Button type="submit" variant="primary" disabled={isSaving}>
                  {isSaving ? 'Salvando...' : 'REGISTRAR'}
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
              LANCAMENTO FINANCEIRO REGISTRADO COM SUCESSO!
            </h3>
            <p className="text-[11px] text-brand-grey leading-normal">
              O fluxo de caixa foi atualizado no banco de dados.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
