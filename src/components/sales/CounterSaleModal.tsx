'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

interface CounterSaleModalProps {
  open: boolean;
  onClose: () => void;
  onCompleted: () => Promise<void> | void;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  stock_quantity: number;
}

interface CustomerOption {
  id: string;
  full_name: string;
  email: string;
}

interface SaleItem extends ProductOption {
  quantity: number;
}

interface CustomerRow {
  id: string;
  full_name: string | null;
  email: string | null;
  customers: { id: string } | { id: string }[] | null;
}

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function CounterSaleModal({ open, onClose, onCompleted }: CounterSaleModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const { success, error } = useToast();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [productId, setProductId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Dinheiro');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    async function loadOptions() {
      setIsLoading(true);
      try {
        const [productsResult, customersResult] = await Promise.all([
          supabase
            .from('products')
            .select('id, name, sku, price, stock_quantity')
            .gt('stock_quantity', 0)
            .order('name'),
          supabase
            .from('profiles')
            .select('id, full_name, email, customers ( id )')
            .order('full_name')
        ]);

        if (productsResult.error) throw productsResult.error;
        if (customersResult.error) throw customersResult.error;

        setProducts((productsResult.data || []).map((product) => ({
          ...product,
          price: Number(product.price) || 0,
          stock_quantity: Number(product.stock_quantity) || 0
        })));
        setCustomers(((customersResult.data || []) as CustomerRow[])
          .filter((profile) => profile.customers)
          .map((profile) => ({
            id: profile.id,
            full_name: profile.full_name || 'Cliente sem nome',
            email: profile.email || ''
          })));
      } catch (loadError) {
        error('Erro ao carregar venda', loadError instanceof Error ? loadError.message : 'Não foi possível carregar os produtos.');
      } finally {
        setIsLoading(false);
      }
    }

    void loadOptions();
  }, [open, supabase, error]);

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const reset = () => {
    setItems([]);
    setProductId('');
    setCustomerId('');
    setCustomerName('');
    setCustomerEmail('');
    setPaymentMethod('Dinheiro');
    setNotes('');
    setCompletedOrderId(null);
  };

  const close = () => {
    if (isSaving) return;
    reset();
    onClose();
  };

  const addProduct = () => {
    const product = products.find((option) => option.id === productId);
    if (!product) return;

    setItems((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock_quantity) {
          error('Estoque insuficiente', `Há somente ${product.stock_quantity} unidade(s) de ${product.name}.`);
          return current;
        }
        return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...current, { ...product, quantity: 1 }];
    });
    setProductId('');
  };

  const changeQuantity = (id: string, delta: number) => {
    setItems((current) => current
      .map((item) => item.id === id
        ? { ...item, quantity: Math.min(item.stock_quantity, item.quantity + delta) }
        : item)
      .filter((item) => item.quantity > 0));
  };

  const selectCustomer = (id: string) => {
    setCustomerId(id);
    const customer = customers.find((option) => option.id === id);
    if (customer) {
      setCustomerName(customer.full_name);
      setCustomerEmail(customer.email);
    } else {
      setCustomerName('');
      setCustomerEmail('');
    }
  };

  const finalizeSale = async (event: React.FormEvent) => {
    event.preventDefault();
    if (items.length === 0) {
      error('Venda sem itens', 'Adicione ao menos um produto ou peça.');
      return;
    }

    setIsSaving(true);
    try {
      const { data, error: saleError } = await supabase.rpc('complete_counter_sale', {
        p_items: items.map((item) => ({ product_id: item.id, quantity: item.quantity })),
        p_customer_id: customerId || null,
        p_customer_name: customerName.trim() || null,
        p_customer_email: customerEmail.trim() || null,
        p_payment_method: paymentMethod,
        p_notes: notes.trim() || null
      });

      if (saleError) throw saleError;

      const orderId = String(data);
      setCompletedOrderId(orderId);
      success('Venda finalizada', `Pedido #${orderId.slice(0, 8).toUpperCase()} pago e estoque atualizado.`);
      await onCompleted();
    } catch (saleError) {
      error('Erro ao finalizar venda', saleError instanceof Error ? saleError.message : 'A venda não pôde ser concluída.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-xs">
      <Card className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto p-6" withStripe>
        <button type="button" onClick={close} className="absolute right-4 top-4 text-brand-grey transition-colors hover:text-white">
          <X className="h-5 w-5" />
        </button>

        {completedOrderId ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-5 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/15 text-emerald-400">
              <Check className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase italic text-white">Venda finalizada</h3>
              <p className="mt-2 text-xs font-mono uppercase tracking-widest text-brand-grey">
                Pedido #{completedOrderId.slice(0, 8).toUpperCase()} registrado como pago
              </p>
            </div>
            <Button type="button" onClick={close}>Concluir atendimento</Button>
          </div>
        ) : (
          <form onSubmit={finalizeSale} className="space-y-6">
            <div className="pr-8">
              <h3 className="flex items-center gap-2 text-lg font-black uppercase italic text-white">
                <ShoppingCart className="h-5 w-5 text-brand-red" /> Venda de balcão
              </h3>
              <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-brand-grey">
                Selecione as peças, receba o pagamento e finalize a venda
              </p>
            </div>

            <div className="border border-brand-grey/15 bg-brand-black/50 p-4">
              <p className="mb-3 text-[10px] font-mono uppercase tracking-widest text-brand-red">Informações da venda</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1 lg:col-span-2">
                  <label className="text-[10px] font-mono uppercase text-brand-grey">Cliente cadastrado (opcional)</label>
                  <select value={customerId} onChange={(event) => selectCustomer(event.target.value)} className="w-full rounded border border-brand-grey/25 bg-brand-input px-3 py-2 text-xs font-mono text-white focus:border-brand-red focus:outline-none">
                    <option value="">Consumidor não identificado</option>
                    {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}</option>)}
                  </select>
                </div>
                <div className="space-y-1 lg:col-span-2">
                  <label className="text-[10px] font-mono uppercase text-brand-grey">Forma de pagamento</label>
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="w-full rounded border border-brand-grey/25 bg-brand-input px-3 py-2 text-xs font-mono text-white focus:border-brand-red focus:outline-none">
                    <option>Dinheiro</option>
                    <option>PIX</option>
                    <option>Cartão de débito</option>
                    <option>Cartão de crédito</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-brand-grey">Nome</label>
                  <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} disabled={Boolean(customerId)} placeholder="Cliente avulso (opcional)" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-brand-grey">E-mail</label>
                  <Input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} disabled={Boolean(customerId)} placeholder="Opcional" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono uppercase text-brand-grey">Observações</label>
                  <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Informações adicionais da venda (opcional)" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
                <div className="flex gap-2">
                  <select
                    value={productId}
                    onChange={(event) => setProductId(event.target.value)}
                    disabled={isLoading}
                    className="min-w-0 flex-1 rounded border border-brand-grey/25 bg-brand-input px-3 py-2 text-xs font-mono text-white focus:border-brand-red focus:outline-none"
                  >
                    <option value="">{isLoading ? 'Carregando produtos...' : 'Selecione um produto ou peça'}</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · {product.stock_quantity} un · {money(product.price)}
                      </option>
                    ))}
                  </select>
                  <Button type="button" variant="secondary" onClick={addProduct} disabled={!productId}>
                    <Plus className="h-4 w-4" /> Adicionar
                  </Button>
                </div>

                <div className="min-h-52 border border-brand-grey/15 bg-brand-black/40">
                  {items.length === 0 ? (
                    <div className="flex min-h-52 items-center justify-center px-6 text-center text-xs font-mono text-brand-grey">
                      Nenhum item adicionado à venda.
                    </div>
                  ) : (
                    <div className="divide-y divide-brand-grey/10">
                      {items.map((item) => (
                        <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-4 p-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-white">{item.name}</p>
                            <p className="mt-1 text-[10px] font-mono uppercase text-brand-grey">
                              {item.sku || 'Sem SKU'} · {money(item.price)} cada
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => changeQuantity(item.id, -1)} className="flex h-8 w-8 items-center justify-center border border-brand-grey/20 text-brand-grey hover:text-white">
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-8 text-center font-mono text-sm text-white">{item.quantity}</span>
                            <button type="button" onClick={() => changeQuantity(item.id, 1)} disabled={item.quantity >= item.stock_quantity} className="flex h-8 w-8 items-center justify-center border border-brand-grey/20 text-brand-grey hover:text-white disabled:opacity-30">
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => setItems((current) => current.filter((currentItem) => currentItem.id !== item.id))} className="ml-1 flex h-8 w-8 items-center justify-center border border-brand-red/25 text-brand-red hover:bg-brand-red/10">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
            </div>

            <div className="flex flex-col gap-4 border-t border-brand-grey/15 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-brand-grey">Total a receber</p>
                <p className="text-2xl font-black italic text-white">{money(total)}</p>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={close}>Cancelar</Button>
                <Button type="submit" disabled={isSaving || items.length === 0}>
                  {isSaving ? 'Finalizando...' : 'Finalizar venda'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
