'use client';

import { useEffect, useState } from 'react';
import { Download, FileText, Package, Wrench, X } from 'lucide-react';
import type { SaleReportDetail, ServiceReportDetail } from '@/lib/reports/report-pdf';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type Detail = SaleReportDetail | ServiceReportDetail;

interface ReportDetailModalProps {
  kind: 'sale' | 'service';
  id: string;
  onClose: () => void;
}

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '-';

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="border-b border-brand-grey/10 pb-2">
      <p className="text-[9px] font-mono uppercase tracking-widest text-brand-grey">{label}</p>
      <p className="mt-1 text-xs font-semibold text-white">{value ?? '-'}</p>
    </div>
  );
}

function DetailTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  if (!rows.length) return <p className="py-5 text-center text-xs font-mono text-brand-grey">Nenhum registro.</p>;
  return (
    <div className="overflow-x-auto border border-brand-grey/15">
      <table className="w-full border-collapse text-left">
        <thead className="bg-brand-darkgrey text-[9px] font-mono uppercase tracking-wider text-brand-grey">
          <tr>{headers.map((header) => <th key={header} className="px-3 py-2.5">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-brand-grey/10 text-xs">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3 text-brand-silver">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportDetailModal({ kind, id, onClose }: ReportDetailModalProps) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const baseUrl = kind === 'sale' ? `/api/relatorios/vendas/${id}` : `/api/relatorios/servicos/${id}`;

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(baseUrl, { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar os detalhes.');
        if (active) setDetail(result as Detail);
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Falha ao carregar detalhes.');
      }
    }
    void load();
    return () => { active = false; };
  }, [baseUrl]);

  const downloadPdf = () => {
    const link = document.createElement('a');
    link.href = `${baseUrl}?format=pdf`;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <Card className="max-h-[92vh] w-full max-w-5xl overflow-y-auto p-0" withStripe>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-brand-grey/15 bg-brand-card px-6 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-black uppercase italic text-white">
              {kind === 'sale' ? <Package className="h-5 w-5 text-brand-red" /> : <Wrench className="h-5 w-5 text-brand-red" />}
              {kind === 'sale' ? 'Detalhes da venda' : 'Detalhes do serviço'}
            </h3>
            <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-brand-grey">#{id.slice(0, 8).toUpperCase()}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar detalhes" className="text-brand-grey transition-colors hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {!detail && !loadError && <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-44 w-full" /><Skeleton className="h-28 w-full" /></div>}
          {loadError && <div className="border border-brand-red/30 bg-brand-red/10 p-5 text-sm text-red-300">{loadError}</div>}

          {detail && (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant={detail.status === 'paid' || detail.status === 'COMPLETED' ? 'success' : 'neutral'}>{detail.status}</Badge>
                  <span className="text-xl font-black italic text-white">{money(detail.total)}</span>
                </div>
                <Button type="button" onClick={downloadPdf}>
                  <Download className="h-4 w-4" /> Baixar PDF completo
                </Button>
              </div>

              <section>
                <h4 className="mb-3 text-[10px] font-mono font-black uppercase tracking-[0.2em] text-brand-red">Cliente</h4>
                <div className="grid grid-cols-1 gap-3 rounded border border-brand-grey/15 bg-brand-black/35 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Info label="Nome" value={detail.customer.name} />
                  <Info label="Documento" value={detail.customer.document} />
                  <Info label="Telefone" value={detail.customer.phone} />
                  <Info label="E-mail" value={detail.customer.email} />
                  <div className="sm:col-span-2"><Info label="Endereço" value={detail.customer.address} /></div>
                </div>
              </section>

              {detail.kind === 'sale' ? (
                <>
                  <section>
                    <h4 className="mb-3 text-[10px] font-mono font-black uppercase tracking-[0.2em] text-brand-red">Informações da venda</h4>
                    <div className="grid grid-cols-1 gap-3 border border-brand-grey/15 bg-brand-black/35 p-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Info label="Canal" value={detail.salesChannel} />
                      <Info label="Forma de pagamento" value={detail.paymentMethod} />
                      <Info label="Data da venda" value={dateTime(detail.createdAt)} />
                      <Info label="Data do pagamento" value={dateTime(detail.paymentDate)} />
                    </div>
                  </section>
                  <section>
                    <h4 className="mb-3 text-[10px] font-mono font-black uppercase tracking-[0.2em] text-brand-red">Itens vendidos</h4>
                    <DetailTable
                      headers={['SKU', 'Produto', 'Marca / Categoria', 'Qtd.', 'Unitário', 'Total']}
                      rows={detail.items.map((item) => [item.sku || '-', item.name, [item.brand, item.category].filter(Boolean).join(' / ') || '-', item.quantity, money(item.unitPrice), money(item.total)])}
                    />
                  </section>
                </>
              ) : (
                <>
                  <section>
                    <h4 className="mb-3 text-[10px] font-mono font-black uppercase tracking-[0.2em] text-brand-red">Informações do serviço</h4>
                    <div className="grid grid-cols-1 gap-3 border border-brand-grey/15 bg-brand-black/35 p-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Info label="Serviço" value={detail.serviceType} />
                      <Info label="Mecânico" value={detail.mechanic} />
                      <Info label="Criado em" value={dateTime(detail.createdAt)} />
                      <Info label="Atualizado em" value={dateTime(detail.updatedAt)} />
                    </div>
                  </section>
                  {detail.vehicle && (
                    <section>
                      <h4 className="mb-3 text-[10px] font-mono font-black uppercase tracking-[0.2em] text-brand-red">Motocicleta</h4>
                      <div className="grid grid-cols-2 gap-3 border border-brand-grey/15 bg-brand-black/35 p-4 lg:grid-cols-6">
                        <Info label="Marca" value={detail.vehicle.brand} /><Info label="Modelo" value={detail.vehicle.model} />
                        <Info label="Ano" value={detail.vehicle.year} /><Info label="Placa" value={detail.vehicle.plate} />
                        <Info label="Cor" value={detail.vehicle.color} /><Info label="Quilometragem" value={detail.vehicle.mileage != null ? `${detail.vehicle.mileage} km` : null} />
                      </div>
                    </section>
                  )}
                  <section>
                    <h4 className="mb-3 text-[10px] font-mono font-black uppercase tracking-[0.2em] text-brand-red">Descrição técnica</h4>
                    <p className="whitespace-pre-wrap border border-brand-grey/15 bg-brand-black/35 p-4 text-xs leading-relaxed text-brand-silver">{detail.description || '-'}</p>
                  </section>
                  <section>
                    <h4 className="mb-3 text-[10px] font-mono font-black uppercase tracking-[0.2em] text-brand-red">Peças utilizadas</h4>
                    <DetailTable headers={['SKU', 'Produto', 'Qtd.', 'Unitário', 'Total']} rows={detail.products.map((item) => [item.sku || '-', item.name, item.quantity, money(item.unitPrice), money(item.total)])} />
                  </section>
                  <section>
                    <h4 className="mb-3 text-[10px] font-mono font-black uppercase tracking-[0.2em] text-brand-red">Checklist técnico</h4>
                    <DetailTable headers={['Item', 'Situação', 'Observações']} rows={detail.checklist.map((item) => [item.label, item.status, item.notes || '-'])} />
                  </section>
                  {detail.photos.length > 0 && (
                    <section>
                      <h4 className="mb-3 text-[10px] font-mono font-black uppercase tracking-[0.2em] text-brand-red">Registro fotográfico</h4>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {detail.photos.map((photo, index) => <a key={photo.url} href={photo.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 border border-brand-grey/15 p-3 text-xs text-brand-silver hover:border-brand-red hover:text-white"><FileText className="h-4 w-4 text-brand-red" />{index + 1}. {photo.caption || 'Foto do atendimento'}</a>)}
                      </div>
                    </section>
                  )}
                </>
              )}

              {detail.notes ? (
                <section>
                  <h4 className="mb-3 text-[10px] font-mono font-black uppercase tracking-[0.2em] text-brand-red">Observações</h4>
                  <p className="whitespace-pre-wrap border border-brand-grey/15 bg-brand-black/35 p-4 text-xs leading-relaxed text-brand-silver">{detail.notes || '-'}</p>
                </section>
              ) : null}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
