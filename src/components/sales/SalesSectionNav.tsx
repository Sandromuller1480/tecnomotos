'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Package, ReceiptText, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const salesSections = [
  {
    label: 'Venda de peças e produtos',
    href: '/admin/vendas',
    icon: Package,
    exact: true
  },
  {
    label: 'Venda de serviços',
    href: '/admin/vendas/servicos',
    icon: Wrench
  },
  {
    label: 'Fiscal',
    href: '/admin/vendas/fiscal',
    icon: ReceiptText
  },
  {
    label: 'Relatório de vendas',
    href: '/admin/vendas/relatorios',
    icon: BarChart3
  }
];

export function SalesSectionNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Áreas de vendas" className="overflow-x-auto border-b border-brand-grey/15">
      <div className="flex min-w-max gap-1">
        {salesSections.map((section) => {
          const Icon = section.icon;
          const isActive = section.exact
            ? pathname === section.href
            : pathname.startsWith(section.href);

          return (
            <Link
              key={section.href}
              href={section.href}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-3 text-[10px] font-mono font-black uppercase tracking-wider transition-colors',
                isActive
                  ? 'border-brand-red bg-brand-red/10 text-white'
                  : 'border-transparent text-brand-grey hover:bg-white/5 hover:text-white'
              )}
            >
              <Icon className={cn('h-4 w-4', isActive && 'text-brand-red')} />
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
