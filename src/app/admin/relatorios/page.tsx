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
import { ReportDetailModal } from '@/components/reports/ReportDetailModal';
import {
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  ClipboardList,
  Download,
  FileText,
  Eye,
  Package,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Wrench
} from 'lucide-react';

type ReportTab = 'overview' | 'sales' | 'workshop' | 'financial' | 'inventory' | 'audit';

interface OrderRow {
  id: string;
  customer_email: string;
  customer_name: string | null;
  status: string;
  total_amount: number | string;
  payment_date: string | null;
  created_at: string;
}

interface ServiceOrderRow {
  id: string;
  service_type: string;
  status: string;
  total_price: number | string;
  created_at: string;
}

interface ProductRow {
  id: string;
  sku: string | null;
  name: string;
  brand: string | null;
  price: number | string;
  cost_price: number | string | null;
  stock_quantity: number | null;
  min_stock_quantity: number | null;
  stripe_sync_status: string | null;
}

interface FinancialRow {
  id: string;
  type: string;
  status: string;
  category: string;
  description: string;
  amount: number | string;
  payment_method: string | null;
  source: string;
  created_at: string;
}

interface QuotationRow {
  id: string;
  customer_name: string | null;
  title: string;
  status: string;
  total_amount: number | string;
  created_at: string;
}

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user?: {
    full_name: string;
    email: string;
  } | Array<{
    full_name: string;
    email: string;
  }> | null;
}

interface ReportData {
  orders: OrderRow[];
  serviceOrders: ServiceOrderRow[];
  products: ProductRow[];
  financial: FinancialRow[];
  quotations: QuotationRow[];
  audits: AuditRow[];
  customerCount: number;
  employeeCount: number;
}

const tabs: Array<{ id: ReportTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Visao Geral', icon: BarChart3 },
  { id: 'sales', label: 'Comercial', icon: ShoppingBag },
  { id: 'workshop', label: 'Oficina', icon: Wrench },
  { id: 'financial', label: 'Financeiro', icon: FileText },
  { id: 'inventory', label: 'Estoque', icon: Package },
  { id: 'audit', label: 'Auditoria', icon: ShieldCheck }
];

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const asNumber = (value: number | string | null | undefined) => parseFloat(String(value ?? 0)) || 0;
const today = new Date().toISOString().slice(0, 10);

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);

function auditUser(audit: AuditRow) {
  return Array.isArray(audit.user) ? audit.user[0] : audit.user;
}

function orderCustomerName(order: OrderRow) {
  return order.customer_name?.trim() || order.customer_email;
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const headers = Object.keys(rows[0] || { vazio: '' });
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface AdminReportsPageProps {
  embedded?: boolean;
  salesOnly?: boolean;
}

export function ReportsWorkspace({ embedded = false, salesOnly = false }: AdminReportsPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const { success, error, info } = useToast();

  const [data, setData] = useState<ReportData>({
    orders: [],
    serviceOrders: [],
    products: [],
    financial: [],
    quotations: [],
    audits: [],
    customerCount: 0,
    employeeCount: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ReportTab>(salesOnly ? 'sales' : 'overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return toDateInput(date);
  });
  const [endDate, setEndDate] = useState(today);
  const [selectedDetail, setSelectedDetail] = useState<{ kind: 'sale' | 'service'; id: string } | null>(null);

  const inRange = (createdAt: string) => {
    const date = createdAt.slice(0, 10);
    return date >= startDate && date <= endDate;
  };

  const fetchOptional = async <T,>(tableName: string, queryFactory: () => PromiseLike<{ data: T[] | null; error: any }>) => {
    const result = await queryFactory();
    if (result.error) {
      if (String(result.error.message || '').includes(tableName)) return [];
      throw result.error;
    }
    return result.data || [];
  };

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: hasView } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: salesOnly ? 'orders.view' : 'reports.view'
      });

      if (!hasView) {
        router.push('/403');
        return;
      }

      if (salesOnly) {
        const [ordersRes, serviceOrdersRes] = await Promise.all([
          supabase.from('orders').select('id, customer_email, customer_name, status, total_amount, payment_date, created_at').order('created_at', { ascending: false }),
          supabase.from('service_orders').select('id, service_type, status, total_price, created_at').order('created_at', { ascending: false })
        ]);

        if (ordersRes.error) throw ordersRes.error;
        if (serviceOrdersRes.error) throw serviceOrdersRes.error;

        setData((current) => ({
          ...current,
          orders: ordersRes.data || [],
          serviceOrders: serviceOrdersRes.data || []
        }));
        return;
      }

      const [
        ordersRes,
        serviceOrdersRes,
        productsRes,
        customerCountRes,
        employeeCountRes,
        financialRows,
        quotationRows,
        auditRows
      ] = await Promise.all([
        supabase.from('orders').select('id, customer_email, customer_name, status, total_amount, payment_date, created_at').order('created_at', { ascending: false }),
        supabase.from('service_orders').select('id, service_type, status, total_price, created_at').order('created_at', { ascending: false }),
        supabase.from('products').select('id, sku, name, brand, price, cost_price, stock_quantity, min_stock_quantity, stripe_sync_status').order('name', { ascending: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('employees').select('id', { count: 'exact', head: true }),
        fetchOptional<FinancialRow>('financial_transactions', () =>
          supabase.from('financial_transactions').select('id, type, status, category, description, amount, payment_method, source, created_at').order('created_at', { ascending: false })
        ),
        fetchOptional<QuotationRow>('quotations', () =>
          supabase.from('quotations').select('id, customer_name, title, status, total_amount, created_at').order('created_at', { ascending: false })
        ),
        fetchOptional<AuditRow>('audit_logs', () =>
          supabase
            .from('audit_logs')
            .select('id, action, entity, entity_id, ip_address, user_agent, created_at, user:profiles!audit_logs_user_id_fkey(full_name, email)')
            .order('created_at', { ascending: false })
            .limit(80)
        )
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (serviceOrdersRes.error) throw serviceOrdersRes.error;
      if (productsRes.error) throw productsRes.error;
      if (customerCountRes.error) throw customerCountRes.error;
      if (employeeCountRes.error) throw employeeCountRes.error;

      setData({
        orders: ordersRes.data || [],
        serviceOrders: serviceOrdersRes.data || [],
        products: productsRes.data || [],
        financial: financialRows,
        quotations: quotationRows,
        audits: auditRows,
        customerCount: customerCountRes.count || 0,
        employeeCount: employeeCountRes.count || 0
      });
    } catch (err: any) {
      error('Erro ao carregar relatórios', err.message || 'Não foi possível consultar os dados.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const scoped = useMemo(() => {
    const orders = data.orders.filter((row) => inRange(row.created_at));
    const serviceOrders = data.serviceOrders.filter((row) => inRange(row.created_at));
    const financialManual = data.financial.filter((row) => inRange(row.created_at));
    const quotations = data.quotations.filter((row) => inRange(row.created_at));
    const audits = data.audits.filter((row) => inRange(row.created_at));
    const query = searchQuery.toLowerCase().trim();

    const orderFinancial: FinancialRow[] = orders
      .filter((order) => order.status === 'paid')
      .map((order) => ({
        id: `order-${order.id}`,
        type: 'INCOME',
        status: 'PAID',
        category: 'Venda Online',
        description: `Pedido #${order.id.slice(0, 8).toUpperCase()} - ${orderCustomerName(order)}`,
        amount: order.total_amount,
        payment_method: 'Stripe',
        source: 'ORDER',
        created_at: order.payment_date || order.created_at
      }));

    const serviceFinancial: FinancialRow[] = serviceOrders
      .filter((order) => order.status === 'COMPLETED' && asNumber(order.total_price) > 0)
      .map((order) => ({
        id: `service-${order.id}`,
        type: 'INCOME',
        status: 'PAID',
        category: 'Serviço de Oficina',
        description: `OS #${order.id.slice(0, 8).toUpperCase()} - ${order.service_type}`,
        amount: order.total_price,
        payment_method: 'Oficina',
        source: 'SERVICE_ORDER',
        created_at: order.created_at
      }));

    const financial = [...financialManual, ...orderFinancial, ...serviceFinancial]
      .filter((row) => !query || `${row.category} ${row.description} ${row.source}`.toLowerCase().includes(query));

    return {
      orders: orders.filter((row) => !query || `${row.customer_name || ''} ${row.customer_email} ${row.status} ${row.id}`.toLowerCase().includes(query)),
      serviceOrders: serviceOrders.filter((row) => !query || `${row.service_type} ${row.status} ${row.id}`.toLowerCase().includes(query)),
      financial,
      quotations: quotations.filter((row) => !query || `${row.title} ${row.customer_name || ''} ${row.status}`.toLowerCase().includes(query)),
      audits: audits.filter((row) => {
        const user = auditUser(row);
        return !query || `${row.action} ${row.entity} ${user?.email || ''} ${user?.full_name || ''}`.toLowerCase().includes(query);
      }),
      products: data.products.filter((row) => !query || `${row.sku || ''} ${row.name} ${row.brand || ''} ${row.stripe_sync_status || ''}`.toLowerCase().includes(query))
    };
  }, [data, startDate, endDate, searchQuery]);

  const metrics = useMemo(() => {
    const paidOrders = scoped.orders.filter((order) => order.status === 'paid');
    const salesRevenue = paidOrders.reduce((sum, order) => sum + asNumber(order.total_amount), 0);
    const workshopRevenue = scoped.serviceOrders
      .filter((order) => order.status === 'COMPLETED')
      .reduce((sum, order) => sum + asNumber(order.total_price), 0);
    const income = scoped.financial.filter((entry) => entry.type === 'INCOME' && entry.status !== 'CANCELLED').reduce((sum, entry) => sum + asNumber(entry.amount), 0);
    const expenses = scoped.financial.filter((entry) => entry.type === 'EXPENSE' && entry.status !== 'CANCELLED').reduce((sum, entry) => sum + asNumber(entry.amount), 0);
    const lowStock = data.products.filter((product) => (product.stock_quantity || 0) <= (product.min_stock_quantity || 0));
    const inventoryValue = data.products.reduce((sum, product) => sum + asNumber(product.price) * (product.stock_quantity || 0), 0);
    const approvedQuotes = scoped.quotations.filter((quotation) => quotation.status === 'APPROVED');
    const quoteTotal = scoped.quotations.reduce((sum, quotation) => sum + asNumber(quotation.total_amount), 0);

    return {
      paidOrders: paidOrders.length,
      salesRevenue,
      workshopRevenue,
      income,
      expenses,
      netCash: income - expenses,
      lowStockCount: lowStock.length,
      inventoryValue,
      serviceOpen: scoped.serviceOrders.filter((order) => order.status === 'PENDING' || order.status === 'IN_PROGRESS').length,
      approvedQuotes: approvedQuotes.length,
      quoteTotal
    };
  }, [scoped, data.products]);

  const exportCurrent = () => {
    if (salesOnly) {
      downloadCsv(`relatorio-vendas-${today}.csv`, [
        ...scoped.orders.map((order) => ({
          tipo: 'Venda de peças e produtos',
          id: order.id,
          descricao: orderCustomerName(order),
          status: order.status,
          total: asNumber(order.total_amount),
          data: order.created_at
        })),
        ...scoped.serviceOrders.map((order) => ({
          tipo: 'Venda de serviços',
          id: order.id,
          descricao: order.service_type,
          status: order.status,
          total: asNumber(order.total_price),
          data: order.created_at
        }))
      ]);
      success('Relatório exportado', 'O arquivo CSV de vendas foi gerado.');
      return;
    }

    if (activeTab === 'overview') {
      downloadCsv(`relatorio-geral-${today}.csv`, [
        { indicador: 'Receita de vendas', valor: metrics.salesRevenue },
        { indicador: 'Receita de oficina', valor: metrics.workshopRevenue },
        { indicador: 'Entradas financeiras', valor: metrics.income },
        { indicador: 'Saidas financeiras', valor: metrics.expenses },
        { indicador: 'Saldo', valor: metrics.netCash },
        { indicador: 'Clientes cadastrados', valor: data.customerCount },
        { indicador: 'Funcionários cadastrados', valor: data.employeeCount },
        { indicador: 'Produtos com estoque baixo', valor: metrics.lowStockCount }
      ]);
    }
    if (activeTab === 'sales') {
      downloadCsv(`relatorio-comercial-${today}.csv`, scoped.orders.map((order) => ({
        id: order.id,
        cliente: orderCustomerName(order),
        cliente_email: order.customer_email,
        status: order.status,
        total: asNumber(order.total_amount),
        data: order.created_at
      })));
    }
    if (activeTab === 'workshop') {
      downloadCsv(`relatorio-oficina-${today}.csv`, scoped.serviceOrders.map((order) => ({
        id: order.id,
        serviço: order.service_type,
        status: order.status,
        total: asNumber(order.total_price),
        data: order.created_at
      })));
    }
    if (activeTab === 'financial') {
      downloadCsv(`relatorio-financeiro-${today}.csv`, scoped.financial.map((entry) => ({
        id: entry.id,
        tipo: entry.type,
        status: entry.status,
        categoria: entry.category,
        descrição: entry.description,
        valor: asNumber(entry.amount),
        origem: entry.source,
        data: entry.created_at
      })));
    }
    if (activeTab === 'inventory') {
      downloadCsv(`relatorio-estoque-${today}.csv`, scoped.products.map((product) => ({
        sku: product.sku,
        nome: product.name,
        marca: product.brand,
        estoque: product.stock_quantity,
        minimo: product.min_stock_quantity,
        preço: asNumber(product.price),
        valor_total: asNumber(product.price) * (product.stock_quantity || 0),
        stripe: product.stripe_sync_status
      })));
    }
    if (activeTab === 'audit') {
      downloadCsv(`relatorio-auditoria-${today}.csv`, scoped.audits.map((audit) => ({
        usuario: auditUser(audit)?.email || '-',
        acao: audit.action,
        entidade: audit.entity,
        entidade_id: audit.entity_id,
        ip: audit.ip_address,
        data: audit.created_at
      })));
    }
    success('Relatório exportado', 'O arquivo CSV foi gerado.');
  };

  const downloadDetailPdf = (kind: 'sale' | 'service', id: string) => {
    const resource = kind === 'sale' ? 'vendas' : 'servicos';
    const link = document.createElement('a');
    link.href = `/api/relatorios/${resource}/${id}?format=pdf`;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const printDetailPdf = async (kind: 'sale' | 'service', id: string) => {
    const resource = kind === 'sale' ? 'vendas' : 'servicos';

    try {
      const response = await fetch(`/api/relatorios/${resource}/${id}?format=pdf`, {
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('Não foi possível preparar o documento para impressão.');

      const pdfUrl = URL.createObjectURL(await response.blob());
      const frame = document.createElement('iframe');
      frame.title = kind === 'sale' ? 'Impressão da venda' : 'Impressão do serviço';
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';

      const cleanup = () => {
        URL.revokeObjectURL(pdfUrl);
        frame.remove();
      };

      frame.onload = () => {
        window.setTimeout(() => {
          const printWindow = frame.contentWindow;
          if (!printWindow) {
            cleanup();
            error('Erro ao imprimir', 'O navegador não conseguiu abrir a impressão do documento.');
            return;
          }

          printWindow.addEventListener('afterprint', cleanup, { once: true });
          printWindow.focus();
          printWindow.print();
          window.setTimeout(cleanup, 60_000);
        }, 300);
      };

      frame.src = pdfUrl;
      document.body.appendChild(frame);
    } catch (printError) {
      error('Erro ao imprimir', printError instanceof Error ? printError.message : 'Não foi possível preparar o documento para impressão.');
    }
  };

  const detailActions = (kind: 'sale' | 'service', id: string) => (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => setSelectedDetail({ kind, id })}
        title={kind === 'sale' ? 'Visualizar venda completa' : 'Visualizar serviço completo'}
        aria-label={kind === 'sale' ? 'Visualizar venda completa' : 'Visualizar serviço completo'}
        className="flex h-8 w-8 items-center justify-center border border-brand-grey/25 text-brand-grey transition-colors hover:border-brand-red hover:text-white"
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => downloadDetailPdf(kind, id)}
        title="Baixar PDF completo"
        aria-label="Baixar PDF completo"
        className="flex h-8 w-8 items-center justify-center border border-brand-grey/25 text-brand-grey transition-colors hover:border-brand-red hover:text-brand-red"
      >
        <Download className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => void printDetailPdf(kind, id)}
        title={kind === 'sale' ? 'Imprimir venda completa' : 'Imprimir serviço completo'}
        aria-label={kind === 'sale' ? 'Imprimir venda completa' : 'Imprimir serviço completo'}
        className="flex h-8 w-8 items-center justify-center border border-brand-grey/25 text-brand-grey transition-colors hover:border-brand-red hover:text-brand-red"
      >
        <Printer className="h-4 w-4" />
      </button>
    </div>
  );

  const metricCards = [
    { label: 'Receita Comercial', value: money(metrics.salesRevenue), detail: `${metrics.paidOrders} pedidos pagos`, icon: ShoppingBag, tone: 'text-emerald-400' },
    { label: 'Receita Oficina', value: money(metrics.workshopRevenue), detail: `${metrics.serviceOpen} OS em aberto`, icon: Wrench, tone: 'text-sky-400' },
    { label: 'Saldo Financeiro', value: money(metrics.netCash), detail: `${money(metrics.income)} entradas`, icon: metrics.netCash >= 0 ? ArrowUpCircle : ArrowDownCircle, tone: metrics.netCash >= 0 ? 'text-emerald-400' : 'text-brand-red' },
    { label: 'Valor em Estoque', value: money(metrics.inventoryValue), detail: `${metrics.lowStockCount} produtos no minimo`, icon: Package, tone: 'text-yellow-500' },
    { label: 'Orcamentos', value: money(metrics.quoteTotal), detail: `${metrics.approvedQuotes} aprovados`, icon: ClipboardList, tone: 'text-blue-400' },
    { label: 'Auditoria', value: String(scoped.audits.length), detail: 'logs no período', icon: ShieldCheck, tone: 'text-brand-grey' }
  ];

  return (
    <div className="space-y-6 text-left">
      {!embedded && (
        <div>
          <Breadcrumb items={[{ label: 'Relatórios' }]} />
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mt-2 border-b border-brand-grey/15 pb-4">
            <div>
              <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
                Relatórios & Auditoria
              </h1>
              <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
                Consulte indicadores comerciais, oficina, caixa, estoque e logs reais do sistema
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={fetchReports} disabled={isLoading}>
                <RefreshCw className="w-4 h-4" /> Atualizar
              </Button>
              <Button size="sm" onClick={exportCurrent} disabled={isLoading}>
                <Download className="w-4 h-4" /> Exportar CSV
              </Button>
            </div>
          </div>
        </div>
      )}

      {embedded && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-brand-red">Relatório de vendas</p>
            <h2 className="mt-2 text-xl font-black uppercase italic text-white">Resultados comerciais</h2>
            <p className="mt-1 text-xs font-mono uppercase tracking-wider text-brand-grey">Vendas de mercadorias e serviços consolidadas por período</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={fetchReports} disabled={isLoading}>
              <RefreshCw className="w-4 h-4" /> Atualizar
            </Button>
            <Button size="sm" onClick={exportCurrent} disabled={isLoading}>
              <Download className="w-4 h-4" /> Exportar CSV
            </Button>
          </div>
        </div>
      )}

      <Card>
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
          <div className="relative w-full max-w-md">
            <Input
              placeholder="Buscar em relatórios, logs, produtos ou clientes..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-9 text-xs font-mono bg-brand-input"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey/60 pointer-events-none z-10" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="w-40 text-xs font-mono" />
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="w-40 text-xs font-mono" />
            <Badge variant="neutral">Periodo Real</Badge>
          </div>
        </div>

        {!salesOnly && <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-2 border px-3 py-2 text-[10px] font-mono uppercase tracking-wider transition-colors ${activeTab === tab.id ? 'bg-brand-red border-brand-red text-white font-bold' : 'border-brand-grey/20 text-brand-grey hover:text-white hover:border-brand-red/60'}`}
              >
                <Icon className="w-4 h-4" /> {tab.label}
              </button>
            );
          })}
        </div>}

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {(salesOnly ? metricCards.slice(0, 2) : metricCards).map((metric) => {
                const Icon = metric.icon;
                return (
                  <div key={metric.label} className="border border-brand-grey/15 bg-brand-input/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-widest text-brand-grey">{metric.label}</p>
                        <p className="text-xl font-black text-white mt-2">{metric.value}</p>
                        <p className="text-[11px] text-brand-grey mt-1">{metric.detail}</p>
                      </div>
                      <Icon className={`w-5 h-5 ${metric.tone}`} />
                    </div>
                  </div>
                );
              })}
            </div>

            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <ReportPanel title="Resumo Operacional">
                  <MetricLine label="Clientes cadastrados" value={data.customerCount} />
                  <MetricLine label="Funcionários cadastrados" value={data.employeeCount} />
                  <MetricLine label="Pedidos no período" value={scoped.orders.length} />
                  <MetricLine label="Ordens de serviço no período" value={scoped.serviceOrders.length} />
                  <MetricLine label="Produtos cadastrados" value={data.products.length} />
                </ReportPanel>
                <ReportPanel title="Alertas Inteligentes">
                  <AlertLine tone={metrics.lowStockCount > 0 ? 'warning' : 'success'} text={`${metrics.lowStockCount} produto(s) com estoque no minimo.`} />
                  <AlertLine tone={metrics.serviceOpen > 0 ? 'warning' : 'success'} text={`${metrics.serviceOpen} ordem(ns) de serviço pendentes ou em andamento.`} />
                  <AlertLine tone={metrics.netCash >= 0 ? 'success' : 'danger'} text={`Saldo consolidado do período: ${money(metrics.netCash)}.`} />
                  <AlertLine tone="info" text={`${scoped.quotations.length} orçamento(s) consultados no período.`} />
                </ReportPanel>
              </div>
            )}

            {(activeTab === 'sales' || salesOnly) && (
              <ReportPanel title="Relatório Comercial">
                <DataTable
                  empty="Nenhum pedido ou orçamento encontrado no período."
                  rows={[
                    ...scoped.orders.map((order) => ({
                      código: `Pedido ${order.id.slice(0, 8).toUpperCase()}`,
                      cliente: orderCustomerName(order),
                      status: order.status,
                      valor: money(asNumber(order.total_amount)),
                      data: new Date(order.created_at).toLocaleDateString('pt-BR'),
                      ações: detailActions('sale', order.id)
                    })),
                    ...scoped.quotations.map((quotation) => ({
                      código: `Orçamento ${quotation.id.slice(0, 8).toUpperCase()}`,
                      cliente: quotation.customer_name || 'Sem cliente',
                      status: quotation.status,
                      valor: money(asNumber(quotation.total_amount)),
                      data: new Date(quotation.created_at).toLocaleDateString('pt-BR')
                    }))
                  ]}
                />
              </ReportPanel>
            )}

            {(activeTab === 'workshop' || salesOnly) && (
              <ReportPanel title="Relatório de Oficina">
                <DataTable
                  empty="Nenhuma ordem de serviço encontrada no período."
                  rows={scoped.serviceOrders.map((order) => ({
                    código: `OS ${order.id.slice(0, 8).toUpperCase()}`,
                    serviço: order.service_type,
                    status: order.status,
                    valor: money(asNumber(order.total_price)),
                    data: new Date(order.created_at).toLocaleDateString('pt-BR'),
                    ações: detailActions('service', order.id)
                  }))}
                />
              </ReportPanel>
            )}

            {activeTab === 'financial' && (
              <ReportPanel title="Fechamento Financeiro">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <SummaryBox label="Entradas" value={money(metrics.income)} tone="text-emerald-400" />
                  <SummaryBox label="Saidas" value={money(metrics.expenses)} tone="text-brand-red" />
                  <SummaryBox label="Saldo" value={money(metrics.netCash)} tone={metrics.netCash >= 0 ? 'text-emerald-400' : 'text-brand-red'} />
                </div>
                <DataTable
                  empty="Nenhum lançamento financeiro encontrado no período."
                  rows={scoped.financial.map((entry) => ({
                    tipo: entry.type === 'INCOME' ? 'Entrada' : 'Saida',
                    categoria: entry.category,
                    descrição: entry.description,
                    valor: money(asNumber(entry.amount)),
                    origem: entry.source,
                    data: new Date(entry.created_at).toLocaleDateString('pt-BR')
                  }))}
                />
              </ReportPanel>
            )}

            {activeTab === 'inventory' && (
              <ReportPanel title="Relatório de Estoque">
                <DataTable
                  empty="Nenhum produto encontrado."
                  rows={scoped.products.map((product) => ({
                    sku: product.sku || '-',
                    produto: product.name,
                    marca: product.brand || '-',
                    estoque: product.stock_quantity || 0,
                    minimo: product.min_stock_quantity || 0,
                    valor: money(asNumber(product.price) * (product.stock_quantity || 0)),
                    stripe: product.stripe_sync_status || 'pendente'
                  }))}
                />
              </ReportPanel>
            )}

            {activeTab === 'audit' && (
              <ReportPanel title="Logs de Auditoria">
                <DataTable
                  empty="Nenhum log de auditoria encontrado no período."
                  rows={scoped.audits.map((audit) => ({
                    usuario: auditUser(audit)?.email || '-',
                    acao: audit.action,
                    entidade: audit.entity,
                    referencia: audit.entity_id || '-',
                    ip: audit.ip_address || '-',
                    data: new Date(audit.created_at).toLocaleString('pt-BR')
                  }))}
                />
              </ReportPanel>
            )}
          </div>
        )}
      </Card>

      {selectedDetail && (
        <ReportDetailModal
          kind={selectedDetail.kind}
          id={selectedDetail.id}
          onClose={() => setSelectedDetail(null)}
        />
      )}
    </div>
  );
}

export default function AdminReportsPage() {
  return <ReportsWorkspace />;
}

function ReportPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-brand-grey/15 bg-brand-black/35 p-4">
      <h3 className="text-sm font-black uppercase tracking-wider text-white mb-4">{title}</h3>
      {children}
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between border-b border-brand-grey/10 py-2 text-sm">
      <span className="text-brand-grey">{label}</span>
      <span className="font-mono font-bold text-white">{value}</span>
    </div>
  );
}

function AlertLine({ tone, text }: { tone: 'success' | 'warning' | 'danger' | 'info'; text: string }) {
  const colors = {
    success: 'text-emerald-400 border-emerald-500/30',
    warning: 'text-yellow-500 border-yellow-500/30',
    danger: 'text-brand-red border-brand-red/40',
    info: 'text-sky-400 border-sky-500/30'
  };
  return (
    <div className={`flex items-center gap-2 border ${colors[tone]} bg-brand-input/30 px-3 py-2 text-xs`}>
      <Activity className="w-4 h-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function SummaryBox({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="border border-brand-grey/15 bg-brand-input/40 p-3">
      <p className="text-[10px] font-mono uppercase tracking-widest text-brand-grey">{label}</p>
      <p className={`text-lg font-black mt-1 ${tone}`}>{value}</p>
    </div>
  );
}

function DataTable({ rows, empty }: { rows: Array<Record<string, React.ReactNode>>; empty: string }) {
  if (rows.length === 0) {
    return <div className="py-10 text-center text-brand-grey font-mono text-xs">{empty}</div>;
  }

  const headers = Object.keys(rows[0]);

  return (
    <div className="overflow-x-auto border border-brand-grey/15">
      <table className="w-full text-left border-collapse text-sm text-brand-silver">
        <thead className="bg-brand-darkgrey border-b border-brand-grey/20 text-xs font-mono uppercase tracking-widest text-brand-grey">
          <tr>
            {headers.map((header) => (
              <th key={header} className="py-3 px-4 font-bold">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-brand-grey/10 hover:bg-white/2 transition-colors">
              {headers.map((header) => (
                <td key={header} className="py-3.5 px-4 align-middle font-mono text-xs">
                  {row[header] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
