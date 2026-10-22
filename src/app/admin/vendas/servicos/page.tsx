import { ClipboardList, FileText, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function ServiceSalesPage() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-brand-red">Venda de serviços</p>
        <h2 className="mt-2 text-xl font-black uppercase italic text-white">Atendimento da oficina</h2>
        <p className="mt-1 max-w-3xl text-xs font-mono uppercase tracking-wider text-brand-grey">
          Abra e acompanhe ordens de serviço, registre peças utilizadas e encaminhe atendimentos concluídos para emissão fiscal.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card withStripe className="flex min-h-56 flex-col justify-between">
          <div>
            <span className="flex h-11 w-11 items-center justify-center border border-brand-red/40 bg-brand-red/10 text-brand-red">
              <Wrench className="h-5 w-5" />
            </span>
            <h3 className="mt-5 text-base font-black uppercase italic text-white">Ordens de serviço</h3>
            <p className="mt-2 text-xs leading-relaxed text-brand-grey">
              Cadastre o cliente e a motocicleta, descreva o serviço, atribua o mecânico e controle materiais, checklist e andamento.
            </p>
          </div>
          <Button href="/admin/oficina" className="mt-6 w-full sm:w-auto">
            <ClipboardList className="h-4 w-4" /> Abrir gestão de serviços
          </Button>
        </Card>

        <Card withStripe className="flex min-h-56 flex-col justify-between">
          <div>
            <span className="flex h-11 w-11 items-center justify-center border border-brand-red/40 bg-brand-red/10 text-brand-red">
              <FileText className="h-5 w-5" />
            </span>
            <h3 className="mt-5 text-base font-black uppercase italic text-white">Nota fiscal de serviço</h3>
            <p className="mt-2 text-xs leading-relaxed text-brand-grey">
              Após concluir a ordem de serviço, acesse a central fiscal para emitir, consultar ou cancelar a respectiva NFS-e.
            </p>
          </div>
          <Button href="/admin/vendas/fiscal/servicos" variant="secondary" className="mt-6 w-full sm:w-auto">
            <FileText className="h-4 w-4" /> Emitir NFS-e
          </Button>
        </Card>
      </div>
    </div>
  );
}
