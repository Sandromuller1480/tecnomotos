'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const options = [
  {
    href: '/admin/fiscal',
    label: 'Venda de produtos',
    description: 'NFC-e para pedidos pagos',
    icon: Package,
    exact: true
  },
  {
    href: '/admin/fiscal/servicos',
    label: 'Prestação de serviços',
    description: 'NFS-e para ordens concluídas',
    icon: Wrench,
    exact: false
  }
];

export function FiscalTypeNav() {
  const pathname = usePathname();

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.exact ? pathname === option.href : pathname.startsWith(option.href);

        return (
          <Link
            key={option.href}
            href={option.href}
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
              <span className="block text-xs font-black uppercase tracking-wider">{option.label}</span>
              <span className="mt-1 block text-[10px] font-mono uppercase tracking-wider text-brand-grey">{option.description}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
