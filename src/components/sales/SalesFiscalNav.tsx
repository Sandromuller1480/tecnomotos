'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const fiscalTypes = [
  { href: '/admin/vendas/fiscal/produtos', label: 'Peças e produtos', description: 'NFC-e de mercadorias', icon: Package },
  { href: '/admin/vendas/fiscal/servicos', label: 'Serviços', description: 'NFS-e da oficina', icon: Wrench }
];

export function SalesFiscalNav() {
  const pathname = usePathname();

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {fiscalTypes.map((type) => {
        const Icon = type.icon;
        const active = pathname === type.href;

        return (
          <Link
            key={type.href}
            href={type.href}
            className={cn(
              'flex items-center gap-4 border p-4 transition-colors',
              active
                ? 'border-brand-red bg-brand-red/10 text-white'
                : 'border-brand-grey/20 bg-[#111] text-brand-grey hover:border-brand-grey/50 hover:text-white'
            )}
          >
            <span className={cn('flex h-10 w-10 items-center justify-center border', active ? 'border-brand-red text-brand-red' : 'border-brand-grey/30')}>
              <Icon className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-xs font-black uppercase tracking-wider">{type.label}</span>
              <span className="mt-1 block text-[10px] font-mono uppercase tracking-wider text-brand-grey">{type.description}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
