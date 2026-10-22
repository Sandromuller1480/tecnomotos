'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/ui/logo';
import {
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  ShoppingCart,
  ShoppingBag,
  Tag,
  Package,
  Warehouse,
  Users,
  Wrench,
  DollarSign,
  Receipt,
  FileText,
  Settings,
  Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface SidebarProps {
  userRole?: string;
  userPermissions?: string[];
  employeeFunction?: string | null;
}

interface MenuItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  activePath?: string;
  exact?: boolean;
}

interface MenuGroup {
  title?: string;
  items: MenuItem[];
}

export function Sidebar({ userRole = 'CUSTOMER', userPermissions = [], employeeFunction = null }: SidebarProps) {
  const pathname = usePathname();
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({
    Comercial: true,
    'Catálogo': true,
    Clientes: true,
    Oficina: true,
    Financeiro: true,
    Fiscal: true,
    Equipe: true,
  });
  const isOwner = userRole === 'OWNER';
  const dashboardHref =
    userRole === 'EMPLOYEE' && employeeFunction === 'SELLER' ? '/admin/dashboard/vendedor' :
    userRole === 'EMPLOYEE' && employeeFunction === 'MECHANIC' ? '/admin/dashboard/mecanico' :
    userRole === 'EMPLOYEE' && employeeFunction === 'CASHIER' ? '/admin/dashboard/caixa' :
    userRole === 'EMPLOYEE' && employeeFunction === 'FINANCIAL' ? '/admin/dashboard/financeiro' :
    '/admin/dashboard';

  // Helper to verify if item is permitted
  const hasPerm = (perm?: string) => {
    if (!perm) return true;
    if (isOwner) return true;
    return userPermissions.includes(perm);
  };

  const menuGroups: MenuGroup[] = [
    {
      items: [
        { label: 'Painel', href: dashboardHref, icon: LayoutDashboard, permission: 'dashboard.view' },
      ],
    },
    {
      title: 'Comercial',
      items: [
        { label: 'Vendas', href: '/admin/vendas', icon: ShoppingCart, permission: 'orders.update' },
        { label: 'Pedidos', href: '/admin/pedidos', icon: ShoppingBag, permission: 'orders.view' },
        { label: 'Orçamentos', href: '/admin/orcamentos?novo=1', activePath: '/admin/orcamentos', icon: ClipboardList, permission: 'orders.view' },
        { label: 'Descontos', href: '/admin/descontos', icon: Tag, permission: 'discounts.view' },
      ],
    },
    {
      title: 'Catálogo',
      items: [
        { label: 'Produtos', href: '/admin/produtos', icon: Package, permission: 'products.view' },
        { label: 'Estoque', href: '/admin/estoque', icon: Warehouse, permission: 'inventory.view' },
      ],
    },
    {
      title: 'Clientes',
      items: [
        { label: 'CRM', href: '/admin/crm', icon: Users, permission: 'crm.view' },
        { label: 'Clientes', href: '/admin/clientes', icon: Users, permission: 'customers.view' },
      ],
    },
    {
      title: 'Oficina',
      items: [
        { label: 'Ordens de Serviço', href: '/admin/oficina', icon: Wrench, permission: 'service_orders.view' },
      ],
    },
    {
      title: 'Financeiro',
      items: [
        { label: 'Fluxo de Caixa', href: '/admin/financeiro', icon: DollarSign, permission: 'financial.view' },
      ],
    },
    {
      title: 'Fiscal',
      items: [
        { label: 'Venda de Produtos', href: '/admin/fiscal', icon: Receipt, permission: 'fiscal.view', exact: true },
        { label: 'Prestação de Serviços', href: '/admin/fiscal/servicos', icon: FileText, permission: 'fiscal.view' },
      ],
    },
    {
      title: 'Equipe',
      items: [
        { label: 'Funcionários', href: '/admin/funcionarios', icon: Briefcase, permission: 'employees.view' },
      ],
    },
    {
      items: [
        { label: 'Relatórios', href: '/admin/relatorios', icon: FileText, permission: 'reports.view' },
        { label: 'Configurações', href: '/admin/configuracoes', icon: Settings, permission: 'settings.view' },
      ],
    },
  ];

  return (
    <aside className="w-64 bg-brand-black border-r border-brand-grey/15 h-screen flex flex-col text-white shrink-0">
      {/* Brand logo header */}
      <div className="h-16 flex items-center px-6 border-b border-brand-grey/15">
        <Link href="/admin/dashboard">
          <Logo />
        </Link>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {menuGroups.map((group, groupIdx) => {
          // Filter items based on current user permissions
          const permittedItems = group.items.filter((item) => hasPerm(item.permission));
          if (permittedItems.length === 0) return null;
          const groupKey = group.title ?? `group-${groupIdx}`;
          const isCollapsed = Boolean(group.title && collapsedGroups[groupKey]);

          return (
            <div key={groupIdx} className="space-y-2">
              {group.title && (
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() =>
                    setCollapsedGroups((current) => ({
                      ...current,
                      [groupKey]: !current[groupKey],
                    }))
                  }
                  className="flex w-full items-center justify-between px-3 text-left text-[9px] font-mono font-black uppercase tracking-[0.2em] text-brand-red drop-shadow-[0_0_7px_rgba(255,0,0,0.55)] transition-colors hover:text-red-400"
                >
                  <span>{group.title}</span>
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 shrink-0 transition-transform',
                      isCollapsed && '-rotate-90'
                    )}
                  />
                </button>
              )}
              {!isCollapsed && (
                <ul className="space-y-1">
                  {permittedItems.map((item, itemIdx) => {
                    const Icon = item.icon;
                    const activePath = item.activePath ?? item.href;
                    const isActive = item.exact
                      ? pathname === activePath
                      : pathname === activePath || (activePath !== '/admin/dashboard' && pathname.startsWith(activePath));

                    return (
                      <li key={itemIdx}>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 text-xs font-mono uppercase tracking-wider font-semibold transition-all skew-x-[-6deg] hover:bg-white/5 hover:text-white',
                            isActive
                              ? 'bg-brand-red text-white hover:bg-brand-red font-bold'
                              : 'text-brand-grey'
                          )}
                        >
                          <span className="skew-x-[6deg] flex items-center gap-3">
                            <Icon className="w-4 h-4 shrink-0" />
                            {item.label}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
      
      {/* Panel status details */}
      <div className="p-4 border-t border-brand-grey/15 bg-[#050505] text-[9px] font-mono text-brand-grey text-center">
        PAINEL ADMINISTRATIVO V1.0
      </div>
    </aside>
  );
}
