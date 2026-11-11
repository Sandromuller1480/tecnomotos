'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle, ShoppingBag } from 'lucide-react';

interface Product {
  sku: string;
  name: string;
  brand: string;
  stock_quantity: number;
  min_stock_quantity: number;
  location?: string;
}

export default function AdminInventoryPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);


  const loadInventory = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('sku, name, brand, stock_quantity, min_stock_quantity, location')
        .order('name', { ascending: true });

      if (error) throw error;

      setProducts((data || []) as Product[]);
    } catch (err) {
      console.warn('[Inventory] Fetch failed.', err);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    async function checkAuthAndLoad() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Check view permission
      const { data: hasView } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'inventory.view'
      });

      if (!hasView) {
        router.push('/403');
        return;
      }

      await loadInventory();
    }

    checkAuthAndLoad();
  }, []);

  // Filter products to buy: stock_quantity <= min_stock_quantity
  const productsToBuy = products.filter(p => p.stock_quantity <= p.min_stock_quantity);

  return (
    <div className="space-y-8 text-left">
      <div>
        <Breadcrumb items={[{ label: 'Catálogo' }, { label: 'Estoque' }]} />
        <div className="flex justify-between items-center mt-2 border-b border-brand-grey/15 pb-4">
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
              Controle de Estoque
            </h1>
            <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
              Monitore os níveis mínimos e controle de reposição
            </p>
          </div>
          <Badge variant="neutral">Logística</Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* SECTION 1: PRODUCTS IN STOCK */}
          <Card className="space-y-6">
            <div className="flex justify-between items-center border-b border-brand-grey/15 pb-4">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-white" />
                <div>
                  <h4 className="text-sm font-black italic uppercase tracking-tight text-white">
                    Produtos em Estoque
                  </h4>
                  <p className="text-[11px] text-brand-grey mt-0.5">
                    Inventário completo de peças e componentes da oficina
                  </p>
                </div>
              </div>
              <Badge variant="neutral" className="font-mono">
                {products.length} {products.length === 1 ? 'PRODUTO' : 'PRODUTOS'}
              </Badge>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Estoque Atual</TableHead>
                  <TableHead>Estoque Mínimo</TableHead>
                  <TableHead className="text-right">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p, idx) => {
                  const isCritical = p.stock_quantity <= p.min_stock_quantity;
                  return (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-brand-red">{p.sku}</TableCell>
                      <TableCell className="font-bold text-white">{p.name}</TableCell>
                      <TableCell>{p.brand || 'Genérico'}</TableCell>
                      <TableCell className={`font-mono ${isCritical ? 'text-red-500 font-bold' : 'text-white'}`}>
                        {p.stock_quantity} un
                      </TableCell>
                      <TableCell className="font-mono text-brand-grey">{p.min_stock_quantity} un</TableCell>
                      <TableCell className="text-right">
                        {isCritical ? (
                          <Badge variant="danger" className="text-[9px]">Estoque Crítico</Badge>
                        ) : (
                          <Badge variant="success" className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Regular</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* SECTION 2: PRODUCTS TO BUY */}
          <Card className="space-y-6" style={{ borderLeft: '4px solid #ef4444' }}>
            <div className="flex justify-between items-center border-b border-brand-grey/15 pb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <div>
                  <h4 className="text-sm font-black italic uppercase tracking-tight text-white">
                    Produtos a Comprar
                  </h4>
                  <p className="text-[11px] text-brand-grey mt-0.5">
                    Itens que atingiram ou estão abaixo do estoque mínimo
                  </p>
                </div>
              </div>
              <Badge variant="danger" className="font-mono">
                {productsToBuy.length} {productsToBuy.length === 1 ? 'ALERTA' : 'ALERTAS'}
              </Badge>
            </div>

            {productsToBuy.length === 0 ? (
              <div className="py-8 text-center text-brand-grey font-mono text-xs flex flex-col items-center gap-2">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
                <span>Nenhum produto abaixo do estoque mínimo. Reposição em dia!</span>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Estoque Atual</TableHead>
                    <TableHead>Estoque Mínimo</TableHead>
                    <TableHead>Sugerido Compra</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productsToBuy.map((p, idx) => {
                    const suggestedBuy = p.min_stock_quantity - p.stock_quantity;
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-brand-red">{p.sku}</TableCell>
                        <TableCell className="font-bold text-white">{p.name}</TableCell>
                        <TableCell>{p.brand || 'Genérico'}</TableCell>
                        <TableCell className="font-mono text-red-500 font-bold bg-red-500/10 px-2 py-1 rounded">
                          {p.stock_quantity} un
                        </TableCell>
                        <TableCell className="font-mono text-brand-grey">{p.min_stock_quantity} un</TableCell>
                        <TableCell className="font-mono text-emerald-500 font-bold">
                          + {suggestedBuy > 0 ? suggestedBuy : 1} un
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
