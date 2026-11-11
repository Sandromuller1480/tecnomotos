import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, ShoppingCart, Users, Warehouse, Wrench, Activity } from 'lucide-react';

interface ServiceOrderRow {
  id: string;
  service_type: string;
  status: string;
  total_price: number | string;
  created_at: string;
}

interface OrderRow {
  id: string;
  customer_email: string;
  status: string;
  total_amount: number | string;
  created_at: string;
}

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const asNumber = (value: number | string | null | undefined) => parseFloat(String(value ?? 0)) || 0;
const serviceStatusLabels: Record<string, string> = {
  PENDING: 'Pendente',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado'
};

async function fetchOptional<T>(query: PromiseLike<{ data: T[] | null; error: any }>, tableName: string) {
  const result = await query;
  if (result.error) {
    if (String(result.error.message || '').includes(tableName)) return [];
    throw result.error;
  }
  return result.data || [];
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [
    paidOrdersRes,
    orderCountRes,
    customerCountRes,
    productCountRes,
    productsRes,
    activeServiceRes,
    recentServiceRes,
    recentOrdersRes,
    financialRows
  ] = await Promise.all([
    supabase.from('orders').select('total_amount').eq('status', 'paid').gte('created_at', monthStartIso),
    supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', monthStartIso),
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('products').select('price, stock_quantity'),
    supabase.from('service_orders').select('id', { count: 'exact', head: true }).in('status', ['PENDING', 'IN_PROGRESS']),
    supabase.from('service_orders').select('id, service_type, status, total_price, created_at').order('created_at', { ascending: false }).limit(3),
    supabase.from('orders').select('id, customer_email, status, total_amount, created_at').order('created_at', { ascending: false }).limit(3),
    fetchOptional(
      supabase.from('financial_transactions').select('type, status, amount, due_date').eq('type', 'EXPENSE').eq('status', 'PENDING'),
      'financial_transactions'
    )
  ]);

  const currentMonthRevenue = (paidOrdersRes.data || []).reduce((sum, order: any) => sum + asNumber(order.total_amount), 0);
  const inventoryValue = (productsRes.data || []).reduce((sum, product: any) => sum + asNumber(product.price) * (product.stock_quantity || 0), 0);
  const weeklyPayables = financialRows
    .filter((entry: any) => !entry.due_date || new Date(`${entry.due_date}T00:00:00`) <= weekEnd)
    .reduce((sum: number, entry: any) => sum + asNumber(entry.amount), 0);

  const metrics = [
    {
      title: 'Faturamento',
      value: money(currentMonthRevenue),
      description: 'Mês corrente',
      icon: DollarSign,
      color: 'text-green-400',
    },
    {
      title: 'Pedidos',
      value: String(orderCountRes.count || 0),
      description: 'Pedidos no mês corrente',
      icon: ShoppingCart,
      color: 'text-brand-red',
    },
    {
      title: 'Clientes',
      value: String(customerCountRes.count || 0),
      description: 'Cadastros ativos',
      icon: Users,
      color: 'text-blue-400',
    },
    {
      title: 'Estoque',
      value: `${productCountRes.count || 0} itens`,
      description: money(inventoryValue),
      icon: Warehouse,
      color: 'text-yellow-500',
    },
    {
      title: 'Ordens de Serviço',
      value: `${activeServiceRes.count || 0} ativas`,
      description: 'Pendentes ou em andamento',
      icon: Wrench,
      color: 'text-red-500',
    },
    {
      title: 'Financeiro',
      value: money(weeklyPayables),
      description: 'Contas a pagar esta semana',
      icon: Activity,
      color: 'text-brand-silver',
    },
  ];

  const recentServices = (recentServiceRes.data || []) as ServiceOrderRow[];
  const recentOrders = (recentOrdersRes.data || []) as OrderRow[];

  return (
    <div className="space-y-6 text-left">
      <div>
        <Breadcrumb items={[{ label: 'Painel' }]} />
        <div className="flex justify-between items-center mt-2 border-b border-brand-grey/15 pb-4">
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
              Painel de Telemetria Geral
            </h1>
            <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
              Indicadores reais de desempenho comercial e operacional
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {metrics.map((m, idx) => {
          const Icon = m.icon;
          return (
            <Card key={idx} hoverEffect withStripe telemetryBg>
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-brand-grey">
                    {m.title}
                  </p>
                  <p className="text-2xl font-black text-white italic tracking-tight">{m.value}</p>
                  <p className="text-[10px] text-brand-grey/70 font-sans">{m.description}</p>
                </div>
                <div className={`p-2.5 bg-brand-darkgrey border border-brand-grey/10 ${m.color}`}>
                  <Icon className="w-5 h-5 shrink-0" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="space-y-4">
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white border-b border-brand-grey/15 pb-2">
            Situação da oficina mecânica
          </h3>
          {recentServices.length === 0 ? (
            <p className="text-xs text-brand-grey font-mono py-6 text-center">Nenhuma ordem de serviço registrada.</p>
          ) : (
            <ul className="space-y-3 font-mono text-[11px]">
              {recentServices.map((order) => (
                <li key={order.id} className="flex justify-between items-center p-2 bg-brand-darkgrey/50 border-l-2 border-brand-red gap-3">
                  <span>{order.service_type}</span>
                  <Badge variant={order.status === 'COMPLETED' ? 'success' : order.status === 'CANCELLED' ? 'danger' : 'warning'}>
                    {serviceStatusLabels[order.status] || order.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-4">
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white border-b border-brand-grey/15 pb-2">
            Pedidos Recentes
          </h3>
          {recentOrders.length === 0 ? (
            <p className="text-xs text-brand-grey font-mono py-6 text-center">Nenhum pedido registrado.</p>
          ) : (
            <ul className="space-y-3 font-mono text-[11px]">
              {recentOrders.map((order) => (
                <li key={order.id} className="flex justify-between items-center p-2 bg-brand-darkgrey/50 gap-3">
                  <span>#{order.id.slice(0, 8).toUpperCase()} - {order.customer_email}</span>
                  <span className="text-white font-bold">{money(asNumber(order.total_amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
