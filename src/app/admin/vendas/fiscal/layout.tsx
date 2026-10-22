import { SalesFiscalNav } from '@/components/sales/SalesFiscalNav';

export default function SalesFiscalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-brand-red">Central fiscal</p>
        <h2 className="mt-2 text-xl font-black uppercase italic text-white">Emissão de notas fiscais</h2>
        <p className="mt-1 max-w-3xl text-xs font-mono uppercase tracking-wider text-brand-grey">
          Emita e acompanhe notas de vendas de mercadorias e de prestação de serviços.
        </p>
      </div>
      <SalesFiscalNav />
      {children}
    </div>
  );
}
