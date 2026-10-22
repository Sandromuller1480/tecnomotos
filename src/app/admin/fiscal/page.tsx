'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
import { FileText, Plus, CheckCircle, RefreshCw, AlertCircle, XCircle } from 'lucide-react';

interface FiscalDocument {
  id: string;
  order_id: string;
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
}

interface PendingFiscalOrder {
  id: string;
  customer_email: string;
  total_amount: number | string;
  created_at: string;
  order_items?: Array<{
    id: string;
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

  const fetchDocuments = async () => {
    const { data: docs, error: fetchErr } = await supabase
      .from('fiscal_documents')
      .select('*')
      .eq('document_type', 'NFCE')
      .order('created_at', { ascending: false });

    if (fetchErr) throw fetchErr;
    setDocuments(docs || []);
    return docs || [];
  };

  const fetchPaidOrders = async (currentDocuments: FiscalDocument[]) => {
    const { data, error: fetchErr } = await supabase
      .from('orders')
      .select(`
        id,
        customer_email,
        total_amount,
        created_at,
        order_items (
          id,
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

    const emittedOrderIds = new Set(currentDocuments.map((doc) => doc.order_id));
    setOrders(((data || []) as unknown as PendingFiscalOrder[]).filter((order) => !emittedOrderIds.has(order.id)));
  };

  const loadFiscalData = async () => {
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
  };

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
  }, []);

  const pendingOrders = useMemo(() => orders.filter((order) => (order.order_items || []).length > 0), [orders]);

  const handleEmitInvoice = async (order: PendingFiscalOrder) => {
    setIsEmitting(order.id);
    info('Emitindo NFC-e', `Enviando pedido #${order.id.slice(0, 8).toUpperCase()} para emissão fiscal.`);

    try {
      const response = await fetch('/api/fiscal/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          customerName: order.customer_email,
          customerDocument: '',
          paymentMethod: 'other'
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro desconhecido na emissão.');

      success('NFC-e registrada', result.reused ? 'Documento fiscal ja existente foi reutilizado.' : 'Documento fiscal registrado com sucesso.');
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
      info('Consultando NFC-e', `Atualizando status fiscal de ${doc.reference || doc.id}.`);
      const response = await fetch('/api/fiscal/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao consultar NFC-e.');
      success('Situação atualizada', `Documento fiscal: ${fiscalStatusLabels[result.document.status] || result.document.status}.`);
      await loadFiscalData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha na consulta.';
      error('Consulta fiscal falhou', msg);
    }
  };

  const handleCancel = async (doc: FiscalDocument) => {
    const reason = window.prompt('Informe a justificativa do cancelamento da NFC-e (15 a 255 caracteres):');
    if (!reason) return;

    try {
      info('Cancelando NFC-e', `Enviando cancelamento de ${doc.reference || doc.id}.`);
      const response = await fetch('/api/fiscal/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id, reason }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao cancelar NFC-e.');
      success('NFC-e cancelada', `Documento fiscal: ${fiscalStatusLabels[result.document.status] || result.document.status}.`);
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
            <Breadcrumb items={[{ label: 'Fiscal' }, { label: 'NFC-e' }]} />
            <div className="flex justify-between items-center mt-2 border-b border-brand-grey/15 pb-4">
              <div>
                <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
                  Emissão Fiscal NFC-e
                </h1>
                <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
                  Monitore documentos fiscais e emita notas a partir de pedidos pagos reais
                </p>
              </div>
              <Badge variant="neutral">Modo Mock</Badge>
            </div>
          </div>

          <FiscalTypeNav />
        </>
      )}

      {embedded && (
        <div className="flex flex-col gap-3 border-b border-brand-grey/15 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black uppercase italic text-white">Notas de peças e produtos</h2>
            <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-brand-grey">Emissão e acompanhamento de NFC-e para pedidos pagos</p>
          </div>
          <Badge variant="neutral">NFC-e</Badge>
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
              description="Pedidos pagos reais que ainda nao possuem documento fiscal aparecerao aqui."
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
                    <h3 className="text-sm font-bold text-white leading-tight">{order.customer_email}</h3>
                    <p className="text-[11px] text-brand-grey mt-1 font-mono">{order.order_items?.length || 0} item(ns)</p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-brand-grey/10 flex items-center justify-between">
                  <span className="text-sm font-black text-white italic">{money(order.total_amount)}</span>
                  <Button variant="primary" size="sm" disabled={isEmitting !== null} onClick={() => handleEmitInvoice(order)}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    {isEmitting === order.id ? 'Emitindo...' : 'Emitir NFC-e'}
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
              description="Os documentos fiscais reais registrados no banco de dados aparecerao aqui."
            />
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nota / Serie</TableHead>
                  <TableHead>Situação Sefaz</TableHead>
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
    </div>
  );
}

export default function AdminFiscalPage() {
  return <FiscalProductsPanel />;
}
