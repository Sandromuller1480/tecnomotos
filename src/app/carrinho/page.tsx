'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ProductImage } from '@/components/ui/product-image';
import { ShoppingCart, Trash2, ShieldCheck, ArrowRight, Minus, Plus } from 'lucide-react';

interface CartItem {
  id: string;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
}

export default function CartPage() {
  const router = useRouter();
  const supabase = createClient();
  const { error, info } = useToast();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Check authentication
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setIsAuthenticated(false);
        router.push('/login');
      } else {
        setIsAuthenticated(true);
      }
    });
  }, []);

  // Load cart from localStorage
  useEffect(() => {
    const data = localStorage.getItem('tecnomotos-cart');
    if (data) {
      try {
        setCart(JSON.parse(data));
      } catch (e) {
        setCart([]);
      }
    }
  }, []);

  const saveCart = (updated: CartItem[]) => {
    setCart(updated);
    localStorage.setItem('tecnomotos-cart', JSON.stringify(updated));
  };

  const handleUpdateQuantity = (idx: number, delta: number) => {
    const updated = [...cart];
    updated[idx].quantity = Math.max(1, updated[idx].quantity + delta);
    saveCart(updated);
  };

  const handleRemoveItem = (idx: number) => {
    const updated = cart.filter((_, i) => i !== idx);
    saveCart(updated);
    info('Item removido', 'O item foi removido do seu carrinho.');
  };

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(item => ({ id: item.id, quantity: item.quantity }))
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao iniciar checkout.');

      // Clear local cart
      localStorage.removeItem('tecnomotos-cart');

      // Redirect to Stripe Checkout page
      window.location.href = data.url;
    } catch (err: any) {
      error('Checkout Falhou', err.message || 'Houve uma falha ao iniciar o fluxo de pagamento.');
      setIsProcessing(false);
    }
  };

  if (isAuthenticated === null) {
    return (
      <div className="flex flex-col min-h-screen bg-brand-black text-white">
        <Navbar isAuthenticated={true} />
        <main className="flex-1 flex items-center justify-center font-mono text-xs text-brand-grey">
          Carregando sessão...
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-brand-black text-white">
      <Navbar isAuthenticated={true} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-12 space-y-8 text-left">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-brand-red font-bold">
            SEU CARRINHO
          </span>
          <h1 className="text-3xl font-black italic uppercase tracking-tight text-white mt-1">
            Resumo de Compras
          </h1>
        </div>

        {cart.length === 0 ? (
          <Card className="text-center p-12 space-y-4" withStripe>
            <div className="w-12 h-12 rounded-full bg-brand-darkgrey text-brand-grey flex items-center justify-center mx-auto">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white uppercase text-sm tracking-wider">Seu carrinho está vazio</h3>
            <p className="text-xs text-brand-grey max-w-sm mx-auto">
              Navegue pelo nosso catálogo de peças e componentes de alto desempenho e adicione itens ao seu carrinho.
            </p>
            <Button variant="primary" size="sm" href="/produtos">
              Ver Catálogo
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Items List */}
            <div className="lg:col-span-2 space-y-4">
              {cart.map((item, idx) => (
                <Card key={idx} className="flex flex-col sm:flex-row items-center gap-4 p-4">
                  <div className="relative w-20 h-20 bg-brand-darkgrey rounded border border-brand-grey/15 overflow-hidden flex-shrink-0">
                    <ProductImage
                      src={item.image_url}
                      alt={item.name}
                      className="object-cover"
                      fallbackLabel="Sem imagem"
                      fallbackClassName="text-[8px] tracking-normal px-1"
                    />
                  </div>

                  <div className="flex-1 text-center sm:text-left space-y-1">
                    <span className="text-[9px] font-mono text-brand-grey uppercase">{item.sku}</span>
                    <h3 className="text-sm font-bold text-white line-clamp-1">{item.name}</h3>
                    <p className="text-xs font-mono text-brand-red">
                      R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  {/* Quantity controls */}
                  <div className="flex items-center border border-brand-grey/20 rounded p-1 font-mono text-xs">
                    <button
                      onClick={() => handleUpdateQuantity(idx, -1)}
                      className="p-1 hover:text-brand-red text-brand-grey transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-3 text-white font-bold">{item.quantity}</span>
                    <button
                      onClick={() => handleUpdateQuantity(idx, 1)}
                      className="p-1 hover:text-brand-red text-brand-grey transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Price Total */}
                  <div className="text-right font-mono text-xs text-white font-bold w-24">
                    R$ {(item.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>

                  {/* Remove Button */}
                  <button
                    onClick={() => handleRemoveItem(idx)}
                    className="p-1 hover:text-brand-red text-brand-grey transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </Card>
              ))}
            </div>

            {/* Checkout Summary */}
            <div className="lg:col-span-1">
              <Card className="p-6 space-y-6" withStripe>
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white border-b border-brand-grey/15 pb-2">
                  Resumo do Pedido
                </h3>

                <div className="space-y-3 font-mono text-xs text-brand-grey">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="text-white">
                      R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Entrega / Frete:</span>
                    <span className="text-emerald-400 font-bold">Grátis</span>
                  </div>
                  <div className="flex justify-between text-sm text-white font-bold pt-3 border-t border-brand-grey/10">
                    <span>Total Geral:</span>
                    <span className="text-brand-red">
                      R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="space-y-4 pt-4">
                  <div className="flex items-center gap-2 text-[10px] text-brand-grey font-mono bg-brand-black p-3 border border-brand-grey/10 rounded">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span>Pagamento 100% criptografado e seguro processado pelo Stripe.</span>
                  </div>

                  <Button
                    variant="primary"
                    className="w-full flex items-center justify-center gap-1 font-bold tracking-wider"
                    onClick={handleCheckout}
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'PROCESSANDO...' : (
                      <>
                        FINALIZAR E PAGAR <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
