'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ProductImage } from '@/components/ui/product-image';
import { useRouter } from 'next/navigation';

interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  price: number;
  category: string;
  image_url?: string;
}

interface CartItem {
  id: string;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
}

export default function PublicProductsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { success } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleAddToCart = (product: Product) => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    const cartData = localStorage.getItem('tecnomotos-cart');
    let cart: CartItem[] = [];
    if (cartData) {
      try {
        cart = JSON.parse(cartData) as CartItem[];
      } catch {
        cart = [];
      }
    }

    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({
        id: product.id,
        sku: product.sku,
        name: product.name,
        price: product.price,
        quantity: 1,
        image_url: product.image_url
      });
    }

    localStorage.setItem('tecnomotos-cart', JSON.stringify(cart));
    success('Produto adicionado', `${product.name} foi adicionado ao carrinho!`);
  };

  useEffect(() => {
    async function loadProducts() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, sku, name, brand, price, category, image_url')
          .eq('show_in_store', true)
          .order('created_at', { ascending: false });

        if (error) throw error;

        setProducts((data || []) as Product[]);
      } catch (err) {
        console.warn('[Products Catalog] DB fetch failed.', err);
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadProducts();
  }, [supabase]);

  return (
    <div className="flex flex-col min-h-screen bg-brand-black text-white">
      <Navbar isAuthenticated={isAuthenticated} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 text-left">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-brand-red font-bold">
            CATÁLOGO PÚBLICO
          </span>
          <h1 className="text-3xl font-black italic uppercase tracking-tight text-white mt-1">
            Peças e Componentes
          </h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Categories Sidebar */}
          <div className="md:col-span-1">
            <Card className="p-4" withStripe>
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white border-b border-brand-grey/15 pb-2 mb-3">
                Categorias
              </h3>
              <ul className="space-y-2 font-mono text-[11px] text-brand-grey">
                <li className="text-white font-bold cursor-pointer">Ver Todos</li>
                <li className="hover:text-white cursor-pointer">Escapamentos</li>
                <li className="hover:text-white cursor-pointer">Freios</li>
                <li className="hover:text-white cursor-pointer">Suspensão</li>
                <li className="hover:text-white cursor-pointer">Pneus</li>
              </ul>
            </Card>
          </div>

          {/* Product grid */}
          <div className="md:col-span-3 space-y-6">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map((p, idx) => (
                  <Card key={idx} hoverEffect className="flex flex-col justify-between overflow-hidden" withStripe>
                    <div className="relative w-full aspect-square bg-brand-darkgrey border-b border-brand-grey/10 mb-4 overflow-hidden rounded-t">
                      <ProductImage
                        src={p.image_url}
                        alt={p.name}
                        className="hover:scale-105 transition-transform duration-300"
                      />
                    </div>

                    <div className="px-4 flex-1 flex flex-col justify-between">
                      <div>
                        <span className="text-[9px] font-mono text-brand-grey uppercase tracking-wider block mb-1">
                          {p.category || 'Peças'}
                        </span>
                        <h3 className="text-sm font-bold text-white mb-4 line-clamp-2">{p.name}</h3>
                      </div>
                      <div className="mt-auto pt-4 border-t border-brand-grey/10 flex flex-col gap-3 pb-2">
                        <div className="flex justify-between items-baseline">
                          <span className="text-[9px] font-mono text-brand-grey">Venda:</span>
                          <span className="text-base font-black text-white italic">
                            R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full font-bold"
                          onClick={() => handleAddToCart(p)}
                        >
                          Adicionar ao Carrinho
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
