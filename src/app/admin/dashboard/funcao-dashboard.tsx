import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, ShoppingBag, Users, Warehouse, Wrench } from 'lucide-react';

type DashboardKind = 'SELLER' | 'MECHANIC' | 'CASHIER' | 'FINANCIAL';

const configs = {
  SELLER: {
    title: 'Painel do Vendedor',
    description: 'Atalhos comerciais, clientes e pedidos',
    badge: 'Vendedor',
    links: [
      { href: '/admin/pedidos', label: 'Pedidos' },
      { href: '/admin/clientes', label: 'Clientes' },
      { href: '/admin/crm', label: 'CRM' }
    ]
  },
  MECHANIC: {
    title: 'Painel do Mecânico',
    description: 'Ordens de serviço, motocicletas e andamento da oficina',
    badge: 'Mecânico',
    links: [
      { href: '/admin/oficina', label: 'Ordens de Serviço' },
      { href: '/admin/clientes', label: 'Clientes' },
      { href: '/admin/estoque', label: 'Estoque' }
    ]
  },
  CASHIER: {
    title: 'Painel do Caixa',
    description: 'Recebimentos, pedidos pagos e fluxo operacional',
    badge: 'Caixa',
    links: [
      { href: '/admin/financeiro', label: 'Fluxo de Caixa' },
      { href: '/admin/pedidos', label: 'Pedidos' },
      { href: '/admin/fiscal', label: 'NF-e' }
    ]
  },
  FINANCIAL: {
    title: 'Painel Financeiro',
    description: 'Fluxo de caixa, receitas, despesas e acompanhamento financeiro',
    badge: 'Financeiro',
    links: [
      { href: '/admin/financeiro', label: 'Fluxo de Caixa' },
      { href: '/admin/pedidos', label: 'Pedidos' },
      { href: '/admin/relatorios', label: 'Relatórios' }
    ]
  }
};

export async function FunctionDashboard({ kind }: { kind: DashboardKind }) {
  const supabase = await createClient();
  const config = configs[kind];

  const [
    { count: customersCount },
    { count: paidOrdersCount },
    { data: paidOrders },
    { count: activeServiceOrders },
    { count: lowStockCount }
  ] = await Promise.all([
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
    supabase.from('orders').select('total_amount').eq('status', 'paid'),
    supabase.from('service_orders').select('id', { count: 'exact', head: true }).in('status', ['PENDING', 'IN_PROGRESS']),
    supabase.from('products').select('id', { count: 'exact', head: true }).lte('stock_quantity', 2)
  ]);

  const revenue = (paidOrders || []).reduce((sum: number, order: any) => sum + (parseFloat(order.total_amount) || 0), 0);
  const formatMoney = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const metrics = [
    { title: 'Clientes', value: String(customersCount || 0), icon: Users, color: 'text-sky-400' },
    { title: 'Pedidos Pagos', value: String(paidOrdersCount || 0), icon: ShoppingBag, color: 'text-emerald-400' },
    { title: 'Faturamento', value: formatMoney(revenue), icon: DollarSign, color: 'text-emerald-400' },
    { title: 'OS Ativas', value: String(activeServiceOrders || 0), icon: Wrench, color: 'text-brand-red' },
    { title: 'Estoque Crítico', value: String(lowStockCount || 0), icon: Warehouse, color: 'text-yellow-400' }
  ];

  return (
    <div className="space-y-6 text-left">
      <div>
        <Breadcrumb items={[{ label: 'Painel' }, { label: config.badge }]} />
        <div className="flex justify-between items-center mt-2 border-b border-brand-grey/15 pb-4">
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
              {config.title}
            </h1>
            <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
              {config.description}
            </p>
          </div>
          <Badge variant="neutral">{config.badge}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.title} hoverEffect withStripe telemetryBg>
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-brand-grey">
                    {metric.title}
                  </p>
                  <p className="text-2xl font-black text-white italic tracking-tight">{metric.value}</p>
                </div>
                <div className={`p-2.5 bg-brand-darkgrey border border-brand-grey/10 ${metric.color}`}>
                  <Icon className="w-5 h-5 shrink-0" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="space-y-4">
        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white border-b border-brand-grey/15 pb-2">
          Acesso Rápido
        </h3>
        <div className="flex flex-wrap gap-3">
          {config.links.map((link) => (
            <Button key={link.href} href={link.href} variant="secondary" size="sm">
              {link.label}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
