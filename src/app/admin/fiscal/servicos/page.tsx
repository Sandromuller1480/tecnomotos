'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle, FileText, Plus, RefreshCw, XCircle } from 'lucide-react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { FiscalTypeNav } from '@/components/fiscal/FiscalTypeNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';

interface FiscalDocument {
  id: string;
  order_id: string;
  invoice_number: string | null;
  series: string | null;
  xml_url: string | null;
  danfe_url: string | null;
  status: string;
  reference?: string | null;
  created_at: string;
}

interface ServiceOrder {
  id: string;
  service_type: string;
  description: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  total_price: number | string;
  created_at: string;
  customer?: {
    document?: string | null;
    profiles?: {
      full_name?: string | null;
      email?: string | null;
    } | Array<{
      full_name?: string | null;
      email?: string | null;
    }> | null;
  } | Array<{
    document?: string | null;
    profiles?: {
      full_name?: string | null;
      email?: string | null;
    } | Array<{
      full_name?: string | null;
      email?: string | null;
    }> | null;
  }> | null;
}

const money = (value: number | string) =>
  (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const customerProfile = (serviceOrder: ServiceOrder) => {
  const customer = Array.isArray(serviceOrder.customer) ? serviceOrder.customer[0] : serviceOrder.customer;
  return Array.isArray(customer?.profiles) ? customer.profiles[0] : customer?.profiles;
};

export function FiscalServicesPanel({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const { success, error, info } = useToast();
  const [documents, setDocuments] = useState<FiscalDocument[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEmitting, setIsEmitting] = useState<string | null>(null);

  const loadFiscalData = async () => {
    setIsLoading(true);
    try {
      const { data: docs, error: docsError } = await supabase
        .from('fiscal_documents')
        .select('*')
        .eq('document_type', 'NFSE')
        .order('created_at', { ascending: false });

      if (docsError) throw docsError;

      const { data: orders, error: ordersError } = await supabase
        .from('service_orders')
        .select(`
          id,
          service_type,
          description,
          status,
          total_price,
          created_at,
          customer:customers!service_orders_customer_id_fkey (
            document,
            profiles!customers_id_fkey (
              full_name,
              email
            )
          )
        `)
        .eq('status', 'COMPLETED')
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;
      setDocuments((docs || []) as FiscalDocument[]);
      setServiceOrders((orders || []) as unknown as ServiceOrder[]);
    } catch (loadError) {
      console.error(loadError);
      error('Erro ao carregar', 'Não foi possível buscar as notas de serviço.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    async function authorizeAndLoad() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: hasPermission } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'fiscal.view'
      });

      if (!hasPermission) {
        router.push('/403');
        return;
      }

      await loadFiscalData();
    }

    authorizeAndLoad();
  }, []);

  const pendingServiceOrders = useMemo(() => {
    const issuedIds = new Set(documents.map((document) => document.order_id));
    return serviceOrders.filter((serviceOrder) => Number(serviceOrder.total_price) > 0 && !issuedIds.has(serviceOrder.id));
  }, [documents, serviceOrders]);

  const handleEmit = async (serviceOrder: ServiceOrder) => {
    setIsEmitting(serviceOrder.id);
    info('Emitindo NFS-e', `Processando a ordem de serviço #${serviceOrder.id.slice(0, 8).toUpperCase()}.`);

    try {
      const response = await fetch('/api/fiscal/emit-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceOrderId: serviceOrder.id })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro desconhecido na emissão.');

      success('NFS-e registrada', result.reused ? 'A nota de serviço já existente foi reutilizada.' : 'A nota de serviço foi registrada com sucesso.');
      await loadFiscalData();
    } catch (emitError) {
      error('Falha de emissão', emitError instanceof Error ? emitError.message : 'Falha ao emitir NFS-e.');
    } finally {
      setIsEmitting(null);
    }
  };

  const handleCheckStatus = async (document: FiscalDocument) => {
    try {
      const response = await fetch('/api/fiscal/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: document.id })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao consultar NFS-e.');
      success('Situação atualizada', `NFS-e ${result.document.status}.`);
      await loadFiscalData();
    } catch (statusError) {
      error('Consulta fiscal falhou', statusError instanceof Error ? statusError.message : 'Falha na consulta.');
    }
  };

  const handleCancel = async (document: FiscalDocument) => {
    const reason = window.prompt('Informe a justificativa do cancelamento da NFS-e (15 a 255 caracteres):');
    if (!reason) return;

    try {
      const response = await fetch('/api/fiscal/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: document.id, reason })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao cancelar NFS-e.');
      success('NFS-e cancelada', `Documento fiscal: ${result.document.status}.`);
      await loadFiscalData();
    } catch (cancelError) {
      error('Cancelamento fiscal falhou', cancelError instanceof Error ? cancelError.message : 'Falha no cancelamento.');
    }
  };

  return (
    <div className="space-y-6 text-left">
      {!embedded && (
        <>
          <div>
            <Breadcrumb items={[{ label: 'Fiscal' }, { label: 'Prestação de serviços' }]} />
            <div className="mt-2 flex items-center justify-between border-b border-brand-grey/15 pb-4">
              <div>
                <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">Emissão Fiscal NFS-e</h1>
                <p className="mt-1 text-xs font-mono uppercase tracking-widest text-brand-grey">
                  Emita notas de prestação de serviço a partir de ordens concluídas
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
            <h2 className="text-lg font-black uppercase italic text-white">Notas de serviços</h2>
            <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-brand-grey">Emissão e acompanhamento de NFS-e para ordens concluídas</p>
          </div>
          <Badge variant="neutral">NFS-e</Badge>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="border-b border-brand-grey/15 pb-2 text-xs font-bold uppercase tracking-widest text-brand-grey font-mono">
          Ordens concluídas pendentes de emissão
        </h2>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        ) : pendingServiceOrders.length === 0 ? (
          <Card>
            <EmptyState title="Nenhuma NFS-e pendente" description="Ordens concluídas com valor de mão de obra aparecerão aqui." />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {pendingServiceOrders.map((serviceOrder) => {
              const profile = customerProfile(serviceOrder);
              return (
                <Card key={serviceOrder.id} className="flex flex-col justify-between" withStripe>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-brand-grey">OS #{serviceOrder.id.slice(0, 8).toUpperCase()}</span>
                      <Badge variant="success" className="text-[9px]">CONCLUÍDA</Badge>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold leading-tight text-white">{profile?.full_name || 'Cliente não identificado'}</h3>
                      <p className="mt-1 text-[11px] font-mono text-brand-grey">{serviceOrder.service_type}</p>
                    </div>
                  </div>
                  <div className="mt-6 flex items-center justify-between border-t border-brand-grey/10 pt-4">
                    <span className="text-sm font-black italic text-white">{money(serviceOrder.total_price)}</span>
                    <Button variant="primary" size="sm" disabled={isEmitting !== null} onClick={() => handleEmit(serviceOrder)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {isEmitting === serviceOrder.id ? 'Emitindo...' : 'Emitir NFS-e'}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4 pt-4">
        <h2 className="border-b border-brand-grey/15 pb-2 text-xs font-bold uppercase tracking-widest text-brand-grey font-mono">Histórico de NFS-e</h2>
        {isLoading ? (
          <Card className="space-y-4 p-8"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></Card>
        ) : documents.length === 0 ? (
          <Card><EmptyState title="Nenhuma NFS-e emitida" description="As notas de serviço registradas aparecerão aqui." /></Card>
        ) : (
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nota / Série</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Data de emissão</TableHead>
                  <TableHead>Documentos</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => {
                  const authorized = ['EMITTED', 'authorized'].includes(document.status);
                  const rejected = ['ERROR', 'error', 'rejected'].includes(document.status);
                  return (
                    <TableRow key={document.id}>
                      <TableCell className="text-xs font-bold text-white font-mono">N. {document.invoice_number || '-'} / {document.series || 'RPS'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {authorized ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : rejected ? <XCircle className="h-4 w-4 text-brand-red" /> : <AlertCircle className="h-4 w-4 text-amber-500" />}
                          <span className={authorized ? 'text-xs font-bold text-emerald-500' : rejected ? 'text-xs font-bold text-brand-red' : 'text-xs font-bold text-amber-500'}>
                            {authorized ? 'AUTORIZADA' : rejected ? 'REJEITADA' : 'CANCELADA'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-brand-grey font-mono">{new Date(document.created_at).toLocaleString('pt-BR')}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {document.danfe_url && <a href={document.danfe_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-brand-red hover:underline font-mono"><FileText className="h-3.5 w-3.5" />PDF</a>}
                          {document.xml_url && <a href={document.xml_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-brand-grey hover:text-white hover:underline font-mono"><FileText className="h-3.5 w-3.5" />XML</a>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" size="sm" onClick={() => handleCheckStatus(document)}><RefreshCw className="mr-1 h-3 w-3" />Consultar</Button>
                          {authorized && <Button variant="secondary" size="sm" onClick={() => handleCancel(document)}>Cancelar</Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function FiscalServicesPage() {
  return <FiscalServicesPanel />;
}
