import React, { TableHTMLAttributes, HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export function Table({ className = '', ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto border border-brand-grey/15">
      <table className={cn('w-full text-left border-collapse text-sm text-brand-silver', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className = '', ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-brand-darkgrey border-b border-brand-grey/20 text-xs font-mono uppercase tracking-widest text-brand-grey', className)} {...props} />;
}

export function TableBody({ className = '', ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className = '', ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-brand-grey/10 hover:bg-white/2 transition-colors duration-150', className)} {...props} />;
}

export function TableHead({ className = '', ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('py-3 px-4 font-bold', className)} {...props} />;
}

export function TableCell({ className = '', ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('py-3.5 px-4 align-middle', className)} {...props} />;
}
