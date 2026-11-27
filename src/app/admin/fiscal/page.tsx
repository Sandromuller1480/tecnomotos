'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { FiscalTypeNav } from '@/components/fiscal/FiscalTypeNav';
import { ReportDetailModal } from '@/components/reports/ReportDetailModal';
import { FileText, Plus, CheckCircle, RefreshCw, AlertCircle, XCircle } from 'lucide-react';

interface FiscalDocument {
  id: string;
  order_id: string | null;
  sale_id?: string | null;
  invoice_number: string;
  series: string;
  xml_url: string;
  danfe_url: string;
  status: 'pending' | 'processing' | 'authorized' | 'rejected' | 'cancelled' | 'contingency' | 'error' | 'EMITTED' | 'CANCELLED' | 'ERROR';
  error_message?: string;
  reference?: string;
  access_key?: string;
  protocol?: string;
  created_at: string;
  document_type?: 'NFCE' | 'NFE' | 'NFSE';
  sale?: FiscalSaleSummary | null;
}

interface CustomerRelation {
  profiles?: {
    full_name?: string | null;
  } | Array<{
    full_name?: string | null;
  }> | null;
}

interface FiscalSaleSummary {
  id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  total_amount: number | string;
  products_total?: number | string;
  created_at: string;
  customer?: CustomerRelation | CustomerRelation[] | null;
}

interface PendingFiscalOrder {
  id: string;
  customer_email: string;
  customer_name?: string | null;
  total_amount: number | string;
  products_total?: number | string;
  created_at: string;
  customer?: CustomerRelation | CustomerRelation[] | null;
  order_items?: Array<{
    id: string;
    item_type: 'PRODUCT' | 'SERVICE';
    quantity: number;
    unit_price: number | string;
    products?: {
      id: string;
      name: string;
      ncm?: string | null;
      cfop?: string | null;
      csosn?: string | null;
      origin?: number | null;
      unit?: string | null;
    } | Array<{
      id: string;
      name: string;
      ncm?: string | null;
      cfop?: string | null;
      csosn?: string | null;
      origin?: number | null;
      unit?: string | null;
    }> | null;
  }>;
}

const money = (value: number | string) =>
  (parseFloat(String(value)) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const orderCustomerName = (order: Pick<PendingFiscalOrder, 'customer_name' | 'customer'>) => {
  const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer;
  const profile = Array.isArray(customer?.profiles) ? customer.profiles[0] : customer?.profiles;
  return order.customer_name?.trim() || profile?.full_name?.trim() || 'Cliente não identificado';
};

const saleDateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : '—';

const fiscalStatusLabels: Record<string, string> = {
  pending: 'Pendente',
  processing: 'Em processamento',
  authorized: 'Autorizada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
  contingency: 'Contingência',
  error: 'Erro',
  EMITTED: 'Autorizada',
  CANCELLED: 'Cancelada',
  ERROR: 'Erro'
};

export function FiscalProductsPanel({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const { success, error, info } = useToast();

  const [documents, setDocuments] = useState<FiscalDocument[]>([]);
  const [orders, setOrders] = useState<PendingFiscalOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEmitting, setIsEmitting] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    const { data: docs, error: fetchErr } = await supabase
      .from('fiscal_documents')
      .select('*')
      .in('document_type', ['NFE', 'NFCE'])
      .order('created_at', { ascending: false });

    if (fetchErr) throw fetchErr;
    const loadedDocuments = (docs || []) as FiscalDocument[];
    const saleIds = [...new Set(loadedDocuments.map((doc) => doc.sale_id || doc.order_id).filter(Boolean))];
    let salesById = new Map<string, FiscalSaleSummary>();

    if (saleIds.length > 0) {
      const { data: sales, error: salesError } = await supabase
        .from('orders')
        .select(`
          id,
          customer_name,
          customer_email,
          total_amount,
          products_total,
          created_at,
          customer:customers!orders_customer_id_fkey (
            profiles!customers_id_fkey (
              full_name
            )
          )
        `)
        .in('id', saleIds);
      if (salesError) throw salesError;
      salesById = new Map(((sales || []) as unknown as FiscalSaleSummary[]).map((sale) => [sale.id, sale]));
    }

    const enrichedDocuments = loadedDocuments.map((doc) => {
      const saleId = doc.sale_id || doc.order_id;
      return {
        ...doc,
        sale: saleId ? salesById.get(saleId) || null : null
      };
    });
    setDocuments(enrichedDocuments);
    return enrichedDocuments;
  }, [supabase]);

  const fetchPaidOrders = useCallback(async (currentDocuments: FiscalDocument[]) => {
    const { data, error: fetchErr } = await supabase
      .from('orders')
      .select(`
        id,
        customer_email,
        customer_name,
        total_amount,
        products_total,
        created_at,
        customer:customers!orders_customer_id_fkey (
          profiles!customers_id_fkey (
            full_name
          )
        ),
        order_items (
          id,
          item_type,
          quantity,
          unit_price,
          products: product_id (
            id,
            name,
            ncm,
            cfop,
            csosn,
            origin,
            unit
          )
        )
      `)
      .eq('status', 'paid')
      .order('created_at', { ascending: false });

    if (fetchErr) throw fetchErr;

    const emittedOrderIds = new Set(currentDocuments.map((doc) => doc.sale_id || doc.order_id).filter(Boolean));
    setOrders(((data || []) as unknown as PendingFiscalOrder[])
      .filter((order) => !emittedOrderIds.has(order.id))
      .map((order) => ({
        ...order,
        order_items: (order.order_items || []).filter((item) => item.item_type !== 'SERVICE')
      }))
      .filter((order) => (order.order_items?.length || 0) > 0));
  }, [supabase]);

  const loadFiscalData = useCallback(async () => {
    setIsLoading(true);
    try {
      const docs = await fetchDocuments();
      await fetchPaidOrders(docs);
    } catch (e: unknown) {
      console.error(e);
      error('Erro ao carregar', 'Não foi possível buscar dados fiscais reais.');
    } finally {
      setIsLoading(false);
    }
  }, [error, fetchDocuments, fetchPaidOrders]);

  useEffect(() => {
    async function checkAuthAndLoad() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: hasPerm } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'fiscal.view'
      });

      if (!hasPerm) {
        router.push('/403');
        return;
      }

      await loadFiscalData();
    }

    checkAuthAndLoad();
  }, [loadFiscalData, router, supabase]);

  const pendingOrders = useMemo(() => orders.filter((order) => (order.order_items || []).length > 0), [orders]);

  const handleEmitInvoice = async (order: PendingFiscalOrder) => {
    if (selectedOrderId !== order.id) {
      setSelectedOrderId(order.id);
      return;
    }
    setIsEmitting(order.id);
    info('Emitindo NF-e', `Enviando pedido #${order.id.slice(0, 8).toUpperCase()} para emissão fiscal.`);

    try {
      const response = await fetch('/api/fiscal/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          customerName: orderCustomerName(order),
          customerDocument: '',
          paymentMethod: 'other'
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro desconhecido na emissão.');

      success('NF-e registrada', result.reused ? 'Documento fiscal já existente foi reutilizado.' : 'Documento fiscal registrado com sucesso.');
      await loadFiscalData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha na emissão.';
      error('Falha de emissão', msg);
    } finally {
      setIsEmitting(null);
    }
  };

  const handleCheckStatus = async (doc: FiscalDocument) => {
    try {
      info('Consultando NF-e', `Atualizando a situação fiscal de ${doc.reference || doc.id}.`);
      const response = await fetch('/api/fiscal/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao consultar NF-e.');
      success('Situação atualizada', `Documento fiscal: ${fiscalStatusLabels[result.document.status] || result.document.status}.`);
      await loadFiscalData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha na consulta.';
      error('Consulta fiscal falhou', msg);
    }
  };

  const handleCancel = async (doc: FiscalDocument) => {
    const reason = window.prompt('Informe a justificativa do cancelamento da NF-e (15 a 255 caracteres):');
    if (!reason) return;

    try {
      info('Cancelando NF-e', `Enviando cancelamento de ${doc.reference || doc.id}.`);
      const response = await fetch('/api/fiscal/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id, reason }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao cancelar NF-e.');
      success('NF-e cancelada', `Documento fiscal: ${fiscalStatusLabels[result.document.status] || result.document.status}.`);
      await loadFiscalData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha no cancelamento.';
      error('Cancelamento fiscal falhou', msg);
    }
  };

  return (
    <div className="space-y-6 text-left">
      {!embedded && (
        <>
          <div>
            <Breadcrumb items={[{ label: 'Fiscal' }, { label: 'NF-e' }]} />
            <div className="flex justify-between items-center mt-2 border-b border-brand-grey/15 pb-4">
              <div>
                <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
                  Emissão Fiscal NF-e
                </h1>
                <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
                  Monitore documentos fiscais e emita notas a partir de pedidos pagos reais
                </p>
              </div>
              <Badge variant="neutral">Modo simulado</Badge>
            </div>
          </div>

          <FiscalTypeNav />
        </>
      )}

      {embedded && (
        <div className="flex flex-col gap-3 border-b border-brand-grey/15 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black uppercase italic text-white">Notas de peças e produtos</h2>
            <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-brand-grey">Emissão e acompanhamento de NF-e para pedidos pagos</p>
          </div>
          <Badge variant="neutral">NF-e</Badge>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-brand-grey border-b border-brand-grey/15 pb-2">
          Pedidos pagos pendentes de emissão
        </h2>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        ) : pendingOrders.length === 0 ? (
          <Card>
            <EmptyState
              title="Nenhum pedido fiscal pendente"
              description="Pedidos pagos reais que ainda não possuem documento fiscal aparecerão aqui."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pendingOrders.map((order) => (
              <Card key={order.id} className="flex flex-col justify-between" withStripe>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono text-brand-grey">PEDIDO #{order.id.slice(0, 8).toUpperCase()}</span>
                    <Badge variant="success" className="text-[9px]">PAGO</Badge>
                  </div>
                  <div>
                    <p className="text-[9px] font-mono uppercase tracking-widest text-brand-grey">Cliente</p>
                    <h3 className="mt-1 text-sm font-bold leading-tight text-white">{orderCustomerName(order)}</h3>
                    <p className="mt-1 text-[11px] font-mono text-brand-grey">{order.order_items?.length || 0} item(ns)</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 border-t border-brand-grey/10 pt-3">
                    <div>
                      <p className="text-[9px] font-mono uppercase tracking-widest text-brand-grey">Data da venda</p>
                      <p className="mt-1 text-xs font-semibold text-brand-silver">{saleDateTime(order.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-mono uppercase tracking-widest text-brand-grey">Valor da venda</p>
                      <p className="mt-1 text-sm font-black italic text-white">{money(order.total_amount)}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end border-t border-brand-grey/10 pt-4">
                  <Button variant="primary" size="sm" disabled={isEmitting !== null} onClick={() => handleEmitInvoice(order)}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    {isEmitting === order.id ? 'Emitindo...' : 'Emitir NF-e'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4 pt-4">
        <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-brand-grey border-b border-brand-grey/15 pb-2">
          Histórico de Documentos Fiscais
        </h2>

        {isLoading ? (
          <Card className="p-8 space-y-4">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </Card>
        ) : documents.length === 0 ? (
          <Card>
            <EmptyState
              title="Nenhuma nota fiscal emitida"
              description="Os documentos fiscais reais registrados no banco de dados aparecerão aqui."
            />
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nota / Série</TableHead>
                  <TableHead>Situação Sefaz</TableHead>
                  <TableHead>Cliente / Venda</TableHead>
                  <TableHead>Data da Venda</TableHead>
                  <TableHead>Valor da Venda</TableHead>
                  <TableHead>Data de Emissão</TableHead>
                  <TableHead>Documentos</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-mono text-xs font-bold text-white">
                      N. {doc.invoice_number} / S-{doc.series}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {['EMITTED', 'authorized'].includes(doc.status) ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                            <span className="text-xs text-emerald-500 font-bold">AUTORIZADA</span>
                          </>
                        ) : ['ERROR', 'error', 'rejected'].includes(doc.status) ? (
                          <>
                            <XCircle className="w-4 h-4 text-brand-red" />
                            <span className="text-xs text-brand-red font-bold">REJEITADA</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                            <span className="text-xs text-amber-500 font-bold">CANCELADA</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-bold text-white">{doc.sale ? orderCustomerName(doc.sale) : 'Cliente não identificado'}</p>
                      <p className="mt-1 text-[10px] font-mono text-brand-grey">{doc.sale ? `VENDA #${doc.sale.id.slice(0, 8).toUpperCase()}` : 'VENDA NÃO VINCULADA'}</p>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-brand-grey">
                      {saleDateTime(doc.sale?.created_at)}
                    </TableCell>
                    <TableCell className="text-xs font-bold text-white">
                      {doc.sale ? money(doc.sale.total_amount) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-brand-grey font-mono">
                      {new Date(doc.created_at).toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {doc.danfe_url && (
                          <a href={doc.danfe_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-mono text-brand-red hover:underline">
                            <FileText className="w-3.5 h-3.5" />
                            DANFE
                          </a>
                        )}
                        {doc.xml_url && (
                          <a href={doc.xml_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-mono text-brand-grey hover:text-white hover:underline">
                            <FileText className="w-3.5 h-3.5" />
                            XML
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => handleCheckStatus(doc)}>
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Consultar
                        </Button>
                        {['EMITTED', 'authorized'].includes(doc.status) && (
                          <Button variant="secondary" size="sm" onClick={() => handleCancel(doc)}>
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {selectedOrderId && (
        <ReportDetailModal
          kind={'sale'}
          id={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onFiscalIssued={() => {
            setSelectedOrderId(null);
            void loadFiscalData();
          }}
        />
      )}
    </div>
  );
}

export default function AdminFiscalPage() {
  return <FiscalProductsPanel />;
}
