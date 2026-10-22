'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  X,
  ClipboardList,
  Eye,
  Store
} from 'lucide-react';

interface OrderItem {
  id: string;
  quantity: number;
  unit_price: number;
  products?: {
    name: string;
    sku: string;
  };
}

interface Order {
  id: string;
  customer_id: string | null;
  customer_email: string;
  status: 'pending_payment' | 'paid' | 'payment_failed' | 'expired';
  total_amount: number;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  payment_date: string | null;
  created_at: string;
  sales_channel: 'ONLINE' | 'COUNTER';
  customer_name: string | null;
  payment_method: string | null;
  notes: string | null;
  customer?: {
    full_name: string;
  };
  order_items?: OrderItem[];
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const supabase = createClient();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Details Modal States
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const fetchOrders = async () => {
    try {
      const { data, error: fetchErr } = await supabase
        .from('orders')
        .select(`
          id,
          customer_id,
          customer_email,
          status,
          total_amount,
          stripe_checkout_session_id,
          stripe_payment_intent_id,
          payment_date,
          created_at,
          sales_channel,
          customer_name,
          payment_method,
          notes,
          customer: customer_id (
            id,
            profiles: id (
              full_name
            )
          ),
          order_items (
            id,
            quantity,
            unit_price,
            products: product_id (
              name,
              sku
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      const formatted = (data || []).map((o) => {
        const customerRelation = Array.isArray(o.customer) ? o.customer[0] : o.customer;
        const custProfile = customerRelation?.profiles;
        const custName = custProfile?.[0]?.full_name || 'Visitante / Sem Cadastro';

        return {
          ...o,
          status: o.status as Order['status'],
          sales_channel: (o.sales_channel || 'ONLINE') as Order['sales_channel'],
          total_amount: parseFloat(o.total_amount) || 0,
          customer: { full_name: o.customer_name || custName },
          order_items: (o.order_items || []).map((item) => {
            const product = Array.isArray(item.products) ? item.products[0] : item.products;
            return {
              ...item,
              unit_price: Number(item.unit_price) || 0,
              products: product ? { name: product.name, sku: product.sku } : undefined
            };
          })
        };
      });

      setOrders(formatted);
    } catch (e: unknown) {
      console.warn('[Orders] Fetch orders failed: ', e instanceof Error ? e.message : e);
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

      // Check permission
      const { data: hasView } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'orders.view'
      });

      if (!hasView) {
        router.push('/403');
        return;
      }

      await fetchOrders();
    }

    checkAuthAndLoad();
  }, []);

  const handleOpenDetails = (o: Order) => {
    setSelectedOrder(o);
    setIsDetailModalOpen(true);
  };

  const filteredOrders = orders.filter((o) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query || (
      o.customer?.full_name.toLowerCase().includes(query) ||
      o.customer_email.toLowerCase().includes(query) ||
      o.id.toLowerCase().includes(query)
    );

    const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 text-left">
      <div>
        <Breadcrumb items={[{ label: 'Comercial' }, { label: 'Pedidos' }]} />
        <div className="flex justify-between items-center mt-2 border-b border-brand-grey/15 pb-4">
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
              Gestão de Pedidos
            </h1>
            <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
              Monitore e processe os pedidos do e-commerce e balcão
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="neutral">Controle Comercial</Badge>
          </div>
        </div>
      </div>

      <Card>
        {/* Search & Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative w-full max-w-sm">
            <Input
              placeholder="Buscar por cliente, e-mail ou código..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs font-mono bg-brand-input"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey/60 pointer-events-none z-10" />
          </div>

          {/* Status Tabs */}
          <div className="flex bg-brand-black p-1 border border-brand-grey/10 rounded font-mono text-[10px] uppercase">
            {[
              { id: 'ALL', label: 'Todos' },
              { id: 'pending_payment', label: 'Aguardando' },
              { id: 'paid', label: 'Pago' },
              { id: 'payment_failed', label: 'Falhou' },
              { id: 'expired', label: 'Expirou' }
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
        ) : filteredOrders.length === 0 ? (
          <div className="py-12 text-center text-brand-grey font-mono text-xs">
            Nenhum pedido correspondente encontrado.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido / Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status Pagamento</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs text-brand-red">
                    <div>#{o.id.slice(0, 8).toUpperCase()}</div>
                    <div className="text-[10px] text-brand-grey mt-0.5">
                      {new Date(o.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </TableCell>
                  <TableCell className="font-bold text-white">{o.customer?.full_name}</TableCell>
                  <TableCell className="font-mono text-xs text-brand-grey">{o.customer_email}</TableCell>
                  <TableCell className="font-mono text-white">
                    R$ {o.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    {o.status === 'pending_payment' && (
                      <Badge variant="neutral" className="text-[9px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">AGUARDANDO PGTO</Badge>
                    )}
                    {o.status === 'paid' && (
                      <Badge variant="success" className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">PAGO</Badge>
                    )}
                    {o.status === 'payment_failed' && (
                      <Badge variant="danger" className="text-[9px]">FALHOU</Badge>
                    )}
                    {o.status === 'expired' && (
                      <Badge variant="neutral" className="text-[9px] bg-brand-grey/10 text-brand-grey border border-brand-grey/20">EXPIRADO</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {o.sales_channel === 'COUNTER' ? (
                      <Badge variant="info" className="text-[9px]">BALCÃO</Badge>
                    ) : (
                      <Badge variant="neutral" className="text-[9px]">ONLINE</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="secondary" size="sm" onClick={() => handleOpenDetails(o)}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> Detalhes
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* DETAILS MODAL */}
      {isDetailModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-xl mx-4 relative p-6 space-y-6" withStripe>
            <button
              onClick={() => {
                setIsDetailModalOpen(false);
                setSelectedOrder(null);
              }}
              className="absolute top-4 right-4 text-brand-grey hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-lg font-black italic uppercase tracking-tight text-white flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-brand-red" />
                Pedido #{selectedOrder.id.slice(0, 8).toUpperCase()}
              </h3>
              <p className="text-[10px] text-brand-grey font-mono uppercase tracking-widest mt-1">
                Visualização de comprovante de venda e pagamento
              </p>
            </div>

            <div className="space-y-4 text-left font-mono text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-brand-black border border-brand-grey/10 p-4 rounded text-brand-grey">
                <div>
                  <span className="text-[9px] uppercase block mb-1">Cliente:</span>
                  <span className="text-white font-bold">{selectedOrder.customer?.full_name}</span>
                </div>
                <div>
                  <span className="text-[9px] uppercase block mb-1">E-mail:</span>
                  <span className="text-white">{selectedOrder.customer_email}</span>
                </div>
                <div>
                  <span className="text-[9px] uppercase block mb-1">Data Criação:</span>
                  <span className="text-white">{new Date(selectedOrder.created_at).toLocaleString('pt-BR')}</span>
                </div>
                <div>
                  <span className="text-[9px] uppercase block mb-1">Confirmado em:</span>
                  <span className="text-white">
                    {selectedOrder.payment_date ? new Date(selectedOrder.payment_date).toLocaleString('pt-BR') : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase block mb-1">Canal:</span>
                  <span className="flex items-center gap-1.5 text-white">
                    {selectedOrder.sales_channel === 'COUNTER' && <Store className="h-3.5 w-3.5 text-brand-red" />}
                    {selectedOrder.sales_channel === 'COUNTER' ? 'Venda de balcão' : 'Loja online'}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase block mb-1">Pagamento:</span>
                  <span className="text-white">{selectedOrder.payment_method || (selectedOrder.sales_channel === 'ONLINE' ? 'Stripe' : '-')}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <span className="text-[10px] text-brand-grey uppercase tracking-wider font-bold block">Itens da Compra</span>
                <div className="border border-brand-grey/10 rounded overflow-hidden">
                  <Table>
                    <TableHeader className="bg-brand-black">
                      <TableRow>
                        <TableHead className="py-2 text-[10px]">Sku</TableHead>
                        <TableHead className="py-2 text-[10px]">Item</TableHead>
                        <TableHead className="py-2 text-[10px]">Qtd</TableHead>
                        <TableHead className="py-2 text-[10px] text-right">Preço Unit.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.order_items?.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="py-2 text-[10px] text-brand-red">{item.products?.sku}</TableCell>
                          <TableCell className="py-2 text-[10px] text-white font-bold">{item.products?.name}</TableCell>
                          <TableCell className="py-2 text-[10px]">{item.quantity} un</TableCell>
                          <TableCell className="py-2 text-[10px] text-right font-mono text-white">
                            R$ {item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Pricing & IDs details */}
              <div className="space-y-2 pt-2 border-t border-brand-grey/10 text-brand-grey text-[10px]">
                <div className="flex justify-between text-white font-bold text-xs">
                  <span>VALOR TOTAL DO PEDIDO:</span>
                  <span className="text-brand-red text-sm">
                    R$ {selectedOrder.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {selectedOrder.stripe_checkout_session_id && (
                  <div className="flex items-center justify-between gap-4 pt-2">
                    <span>Checkout Session ID:</span>
                    <span className="text-white select-all text-right max-w-xs truncate">{selectedOrder.stripe_checkout_session_id}</span>
                  </div>
                )}
                {selectedOrder.stripe_payment_intent_id && (
                  <div className="flex items-center justify-between gap-4">
                    <span>Stripe Payment Intent:</span>
                    <span className="text-white select-all text-right max-w-xs truncate">{selectedOrder.stripe_payment_intent_id}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-brand-grey/10">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedOrder(null);
                }}
              >
                FECHAR
              </Button>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
}
