import { ShoppingCart } from 'lucide-react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { SalesSectionNav } from '@/components/sales/SalesSectionNav';
import { Badge } from '@/components/ui/badge';

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6 text-left">
      <div>
        <Breadcrumb items={[{ label: 'Comercial' }, { label: 'Vendas' }]} />
        <div className="flex flex-col gap-4 border-b border-brand-grey/15 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-black italic uppercase tracking-tight text-white">
              <ShoppingCart className="h-6 w-6 text-brand-red" /> Vendas de balcão
            </h1>
            <p className="mt-1 text-xs font-mono uppercase tracking-widest text-brand-grey">
              Centralize vendas, serviços, documentos fiscais e resultados comerciais
            </p>
          </div>
          <Badge variant="danger">Ponto de venda</Badge>
        </div>
      </div>

      <SalesSectionNav />
      {children}
    </div>
  );
}
