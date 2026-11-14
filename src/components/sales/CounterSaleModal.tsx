'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  variant?: 'modal' | 'page';
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

const normalizeSearch = (value: string) => value
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLocaleLowerCase('pt-BR');

interface ProductComboboxProps {
  products: ProductOption[];
  productId: string;
  isLoading: boolean;
  onChange: (productId: string) => void;
}

function ProductCombobox({ products, productId, isLoading, onChange }: ProductComboboxProps) {
  const selectedProduct = products.find((product) => product.id === productId);
  const [query, setQuery] = useState(selectedProduct?.name || '');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const normalizedQuery = normalizeSearch(query.trim());
  const filteredProducts = normalizedQuery
    ? products.filter((product) => normalizeSearch(`${product.name} ${product.sku || ''}`).includes(normalizedQuery))
    : [];

  const moveActiveOption = (nextIndex: number) => {
    setActiveIndex(nextIndex);
    window.requestAnimationFrame(() => optionRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest' }));
  };

  const selectProduct = (product: ProductOption) => {
    setQuery(product.name);
    setIsOpen(false);
    setActiveIndex(-1);
    onChange(product.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && filteredProducts.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      moveActiveOption(Math.min(activeIndex + 1, filteredProducts.length - 1));
      return;
    }

    if (event.key === 'ArrowUp' && filteredProducts.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      moveActiveOption(activeIndex <= 0 ? filteredProducts.length - 1 : activeIndex - 1);
      return;
    }

    if (event.key === 'Enter' && isOpen) {
      event.preventDefault();
      const product = filteredProducts[activeIndex] || filteredProducts[0];
      if (product) selectProduct(product);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const activeOptionId = isOpen && activeIndex >= 0 ? `counter-sale-product-${filteredProducts[activeIndex]?.id}` : undefined;

  return (
    <div className="relative min-w-0 flex-1">
      <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls="counter-sale-product-list"
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        disabled={isLoading}
        value={query}
        placeholder={isLoading ? 'Carregando produtos...' : 'Selecione um produto ou peça'}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setActiveIndex(-1);
          setIsOpen(nextQuery.trim().length > 0);
          onChange('');
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 100)}
        className={`w-full min-w-0 rounded border bg-brand-input px-3 py-2 text-xs font-mono focus:outline-none ${selectedProduct && selectedProduct.stock_quantity <= 0 ? 'border-brand-red text-brand-red focus:border-brand-red' : 'border-brand-grey/25 text-white focus:border-brand-red'}`}
      />

      {isOpen && (
        <div id="counter-sale-product-list" role="listbox" className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded border border-brand-grey/25 bg-brand-card shadow-2xl">
          {filteredProducts.length === 0 ? (
            <div className="px-3 py-3 text-xs font-mono text-brand-grey">Nenhum produto ou peça encontrado.</div>
          ) : (
            filteredProducts.map((product, index) => {
              const isOutOfStock = product.stock_quantity <= 0;
              const isActive = index === activeIndex;
              return (
                <button
                  id={`counter-sale-product-${product.id}`}
                  key={product.id}
                  ref={(element) => { optionRefs.current[index] = element; }}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectProduct(product)}
                  className={`block w-full border-l-4 px-3 py-2.5 text-left text-xs font-mono transition-colors ${
                    isOutOfStock
                      ? isActive ? 'border-brand-red bg-red-950/80 text-red-300' : 'border-brand-red bg-brand-red/10 text-brand-red hover:bg-brand-red/20'
                      : isActive ? 'border-brand-red bg-brand-red text-white' : 'border-transparent text-brand-silver hover:bg-brand-grey/10 hover:text-white'
                  }`}
                >
                  <span className="block font-bold">{product.name}</span>
                  <span className={`mt-0.5 block text-[10px] ${isOutOfStock ? 'font-black text-brand-red' : 'text-brand-grey'}`}>
                    {product.sku || 'SEM SKU'} · {isOutOfStock ? 'SEM ESTOQUE' : `${product.stock_quantity} un em estoque`} · {money(product.price)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function CounterSaleModal({ open, onClose, onCompleted, variant = 'modal' }: CounterSaleModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const { success, error } = useToast();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [productId, setProductId] = useState('');
  const [productSearchKey, setProductSearchKey] = useState(0);
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
    setProductSearchKey((current) => current + 1);
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
    if (product.stock_quantity <= 0) {
      error('Produto sem estoque', `${product.name} está em falta no estoque.`);
      return;
    }

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
    setProductSearchKey((current) => current + 1);
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

  const selectedProduct = products.find((product) => product.id === productId);

  const salePanel = (
      <Card className={variant === 'modal' ? 'relative max-h-[92vh] w-full max-w-5xl overflow-y-auto p-6' : 'relative w-full p-6'} withStripe>
        {variant === 'modal' && (
          <button type="button" onClick={close} className="absolute right-4 top-4 text-brand-grey transition-colors hover:text-white" aria-label="Fechar venda de balcão">
            <X className="h-5 w-5" />
          </button>
        )}

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
            <Button type="button" onClick={close}>
              {variant === 'page' ? 'Iniciar nova venda' : 'Concluir atendimento'}
            </Button>
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
                  <ProductCombobox
                    key={productSearchKey}
                    products={products}
                    productId={productId}
                    isLoading={isLoading}
                    onChange={setProductId}
                  />
                  <Button type="button" variant="secondary" onClick={addProduct} disabled={!productId || Boolean(selectedProduct && selectedProduct.stock_quantity <= 0)}>
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
                <Button type="button" variant="secondary" onClick={close}>Limpar venda</Button>
                <Button type="submit" disabled={isSaving || items.length === 0}>
                  {isSaving ? 'Finalizando...' : 'Finalizar venda'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Card>
  );

  if (variant === 'page') return salePanel;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-xs">
      {salePanel}
    </div>
  );
}
