'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ClipboardList, ShoppingBag, ArrowRight } from 'lucide-react';

interface OrderItemDetail {
  id: string;
  quantity: number;
  unit_price: number;
  products: {
    sku: string;
    name: string;
  };
}

interface OrderDetail {
  id: string;
  customer_email: string;
  status: string;
  total_amount: number;
  payment_date: string | null;
  order_items: OrderItemDetail[];
}

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (!sessionId) {
      setIsLoading(false);
      return;
    }

    async function fetchOrderDetails() {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            customer_email,
            status,
            total_amount,
            payment_date,
            order_items (
              id,
              quantity,
              unit_price,
              products: product_id (
                sku,
                name
              )
            )
          `)
          .eq('stripe_checkout_session_id', sessionId)
          .single();

        if (error) throw error;
        setOrder(data as any);
      } catch (e) {
        console.error('[Success Page] Failed to fetch order details:', e);
      } finally {
        setIsLoading(false);
      }
    }

    fetchOrderDetails();
  }, [sessionId]);

  return (
    <div className="flex flex-col min-h-screen bg-brand-black text-white">
      <Navbar isAuthenticated={true} />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-16 flex items-center justify-center">
        <Card className="w-full text-center p-8 space-y-6" withStripe>
          <div className="flex flex-col items-center">
            {/* Success Check Icon */}
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 flex items-center justify-center rounded-full mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <Badge variant="success" className="mb-2">
              Pagamento Recebido ✓
            </Badge>

            <h1 className="text-2xl font-black italic uppercase tracking-wider text-white mb-2">
              Obrigado pela sua compra!
            </h1>

            <p className="text-xs text-brand-grey max-w-sm leading-relaxed mb-6 font-mono">
              Seu pedido foi confirmado com sucesso e a equipe da oficina já está separando as peças.
            </p>
          </div>

          {isLoading ? (
            <div className="py-4 text-xs font-mono text-brand-grey animate-pulse">
              Buscando comprovante do pedido...
            </div>
          ) : order ? (
            <div className="bg-brand-black border border-brand-grey/10 rounded p-5 text-left font-mono text-xs space-y-4">
              <div className="border-b border-brand-grey/10 pb-3 flex justify-between items-center text-brand-grey text-[10px]">
                <span>PEDIDO: #{order.id.slice(0, 8).toUpperCase()}</span>
                <span>SITUAÇÃO: PAGO</span>
              </div>

              <div className="space-y-3">
                <div className="text-[10px] text-brand-grey font-bold uppercase tracking-wider">Itens Comprados:</div>
                {order.order_items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start gap-4">
                    <span className="text-white line-clamp-1 flex-1">
                      {item.products?.name} <span className="text-brand-grey">x{item.quantity}</span>
                    </span>
                    <span className="text-brand-silver">
                      R$ {(item.unit_price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-brand-grey/10 pt-3 flex justify-between items-center text-white font-bold">
                <span>VALOR TOTAL:</span>
                <span className="text-brand-red text-sm">
                  R$ {order.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {order.payment_date && (
                <div className="text-[9px] text-brand-grey text-right pt-2 border-t border-brand-grey/5">
                  Confirmado em: {new Date(order.payment_date).toLocaleString('pt-BR')}
                </div>
              )}
            </div>
          ) : (
            <div className="py-4 text-xs font-mono text-brand-red bg-brand-red/5 border border-brand-red/10 rounded">
              Aviso: Detalhes do comprovante não puderam ser carregados. Seu pagamento foi processado com sucesso.
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button variant="secondary" className="flex-1" href="/produtos">
              Continuar Comprando
            </Button>
            <Button variant="primary" className="flex-1 flex items-center justify-center gap-1 font-bold" href="/cliente">
              Ir para Painel <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
