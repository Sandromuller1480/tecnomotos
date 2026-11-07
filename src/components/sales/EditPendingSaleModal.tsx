'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2, PackagePlus, Trash2, Wrench } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

interface EditPendingSaleModalProps {
  open: boolean;
  orderId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
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
  phone: string;
  document: string;
  state_registration: string;
  taxpayer_indicator: string;
  purchase_purpose: string;
  address?: {
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
    postal_code: string;
  };
}

interface EditableItem {
  key: string;
  item_type: 'PRODUCT' | 'SERVICE';
  product_id: string;
  description: string;
  quantity: string;
  unit_price: string;
}

interface OrderItemRow {
  id: string;
  product_id: string | null;
  item_type: string;
  description: string | null;
  quantity: number | string;
  unit_price: number | string;
  quoted_unit_price: number | string | null;
  discount_amount: number | string | null;
}

interface QuotationItemRow {
  id: string;
  product_id: string | null;
  item_type: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
}

interface OrderEditRow {
  id: string;
  quotation_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string;
  customer_phone: string | null;
  status: string;
  sales_channel: string;
  notes: string | null;
  delivery_mode: string | null;
  purchase_purpose: string | null;
  fiscal_taxpayer_indicator: string | null;
  fiscal_state_registration: string | null;
  fiscal_recipient_document: string | null;
  fiscal_freight_mode: string | null;
  fiscal_destination_street: string | null;
  fiscal_destination_number: string | null;
  fiscal_destination_complement: string | null;
  fiscal_destination_neighborhood: string | null;
  fiscal_destination_city: string | null;
  fiscal_destination_uf: string | null;
  fiscal_destination_postal_code: string | null;
  order_items: OrderItemRow[] | null;
}

interface QuotationEditRow {
  id: string;
  title: string;
  vehicle_info: string | null;
  customer_phone: string | null;
  discount_amount: number | string;
  notes: string | null;
  quotation_items: QuotationItemRow[] | null;
}

interface CustomerRow {
  id: string;
  document: string | null;
  state_registration: string | null;
  icms_taxpayer_indicator: string | null;
  purchase_purpose: string | null;
  profiles: { full_name: string | null; email: string | null; phone: string | null } | Array<{ full_name: string | null; email: string | null; phone: string | null }> | null;
  addresses: Array<{
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    is_default: boolean | null;
  }> | null;
}

const BRAZILIAN_UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = (value: string) => Number.parseFloat(value.replace(',', '.')) || 0;
const inputDecimal = (value: number | string | null | undefined) => String(value ?? 0).replace('.', ',');
const itemKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] || null : value;

const deliveryOptions = [
  { value: '', label: 'Não informado' },
  { value: 'pickup', label: 'Retirada na Tecnomotos' },
  { value: 'delivery', label: 'Entrega ao cliente' }
];
const taxpayerOptions = [
  { value: '', label: 'Não informado' },
  { value: 'non_contributor', label: 'Não contribuinte' },
  { value: 'contributor', label: 'Contribuinte do ICMS' },
  { value: 'exempt', label: 'Isento de inscrição estadual' }
];
const purposeOptions = [
  { value: '', label: 'Não informado' },
  { value: 'final_consumption', label: 'Consumo final' },
  { value: 'resale', label: 'Revenda' }
];
const freightOptions = [
  { value: '', label: 'Não informado' },
  { value: 'none', label: 'Sem frete / retirada' },
  { value: 'issuer', label: 'Frete por conta da Tecnomotos' },
  { value: 'recipient', label: 'Frete por conta do cliente' },
  { value: 'third_party', label: 'Frete por terceiros' }
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-brand-grey/15 bg-brand-black/35 p-4">
      <h4 className="mb-4 text-[10px] font-mono font-bold uppercase tracking-widest text-brand-red">{title}</h4>
      {children}
    </section>
  );
}

export function EditPendingSaleModal({ open, orderId, onClose, onSaved }: EditPendingSaleModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const { success, error } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLookingUpCep, setIsLookingUpCep] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [productToAdd, setProductToAdd] = useState('');
  const [quotationId, setQuotationId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [title, setTitle] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [deliveryMode, setDeliveryMode] = useState('');
  const [purchasePurpose, setPurchasePurpose] = useState('');
  const [taxpayerIndicator, setTaxpayerIndicator] = useState('');
  const [stateRegistration, setStateRegistration] = useState('');
  const [recipientDocument, setRecipientDocument] = useState('');
  const [freightMode, setFreightMode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [destinationUf, setDestinationUf] = useState('');
  const [postalCode, setPostalCode] = useState('');

  useEffect(() => {
    if (!open || !orderId) return;

    async function loadSale() {
      setIsLoading(true);
      try {
        const [orderResult, productsResult, customersResult] = await Promise.all([
          supabase
            .from('orders')
            .select(`
              id, quotation_id, customer_id, customer_name, customer_email, customer_phone,
              status, sales_channel, notes, delivery_mode, purchase_purpose,
              fiscal_taxpayer_indicator, fiscal_state_registration, fiscal_recipient_document,
              fiscal_freight_mode, fiscal_destination_street, fiscal_destination_number,
              fiscal_destination_complement, fiscal_destination_neighborhood,
              fiscal_destination_city, fiscal_destination_uf, fiscal_destination_postal_code,
              order_items (id, product_id, item_type, description, quantity, unit_price, quoted_unit_price, discount_amount)
            `)
            .eq('id', orderId)
            .single(),
          supabase.from('products').select('id, name, sku, price, stock_quantity').order('name'),
          supabase.from('customers').select(`
            id, document, state_registration, icms_taxpayer_indicator, purchase_purpose,
            profiles!customers_id_fkey (full_name, email, phone),
            addresses:customer_addresses (street, number, complement, neighborhood, city, state, postal_code, is_default)
          `).order('created_at', { ascending: false })
        ]);

        if (orderResult.error) throw orderResult.error;
        if (productsResult.error) throw productsResult.error;
        if (customersResult.error) throw customersResult.error;

        const order = orderResult.data as unknown as OrderEditRow;
        if (order.status !== 'pending_payment' || order.sales_channel !== 'COUNTER') {
          throw new Error('Somente vendas de balcão pendentes podem ser editadas.');
        }

        const productOptions = (productsResult.data || []).map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: Number(product.price) || 0,
          stock_quantity: Number(product.stock_quantity) || 0
        }));
        setProducts(productOptions);

        const customerOptions = ((customersResult.data || []) as unknown as CustomerRow[]).map((customer) => {
          const profile = one(customer.profiles);
          const addresses = customer.addresses || [];
          const address = addresses.find((entry) => entry.is_default) || addresses[0];
          return {
            id: customer.id,
            full_name: profile?.full_name || 'Cliente sem nome',
            email: profile?.email || '',
            phone: profile?.phone || '',
            document: customer.document || '',
            state_registration: customer.state_registration || '',
            taxpayer_indicator: customer.icms_taxpayer_indicator || '',
            purchase_purpose: customer.purchase_purpose || '',
            address: address ? {
              street: address.street || '', number: address.number || '', complement: address.complement || '',
              neighborhood: address.neighborhood || '', city: address.city || '', state: address.state || '',
              postal_code: address.postal_code || ''
            } : undefined
          };
        });
        setCustomers(customerOptions);

        let sourceItems: Array<OrderItemRow | QuotationItemRow> = order.order_items || [];
        let sourceDiscount = (order.order_items || []).reduce((sum, item) => sum + Number(item.discount_amount || 0), 0);
        let sourceNotes = order.notes || '';
        let sourcePhone = order.customer_phone || '';
        let sourceTitle = '';
        let sourceVehicle = '';

        if (order.quotation_id) {
          const { data: quotationData, error: quotationError } = await supabase
            .from('quotations')
            .select('id, title, vehicle_info, customer_phone, discount_amount, notes, quotation_items (id, product_id, item_type, description, quantity, unit_price)')
            .eq('id', order.quotation_id)
            .single();
          if (quotationError) throw quotationError;
          const quotation = quotationData as unknown as QuotationEditRow;
          sourceItems = quotation.quotation_items || [];
          sourceDiscount = Number(quotation.discount_amount) || 0;
          sourceNotes = quotation.notes || '';
          sourcePhone = quotation.customer_phone || sourcePhone;
          sourceTitle = quotation.title;
          sourceVehicle = quotation.vehicle_info || '';
        }

        setQuotationId(order.quotation_id);
        setCustomerId(order.customer_id || '');
        setCustomerName(order.customer_name || '');
        setCustomerEmail(order.customer_email === 'balcao@tecnomotos.local' ? '' : order.customer_email);
        setCustomerPhone(sourcePhone);
        setTitle(sourceTitle);
        setVehicleInfo(sourceVehicle);
        setDiscountAmount(inputDecimal(sourceDiscount));
        setNotes(sourceNotes);
        setItems(sourceItems.map((item) => ({
          key: item.id || itemKey(),
          item_type: item.item_type === 'SERVICE' ? 'SERVICE' : 'PRODUCT',
          product_id: item.product_id || '',
          description: item.description || '',
          quantity: inputDecimal(item.quantity),
          unit_price: inputDecimal('quoted_unit_price' in item ? item.quoted_unit_price ?? item.unit_price : item.unit_price)
        })));
        setDeliveryMode(order.delivery_mode || 'pickup');
        setPurchasePurpose(order.purchase_purpose || '');
        setTaxpayerIndicator(order.fiscal_taxpayer_indicator || '');
        setStateRegistration(order.fiscal_state_registration || '');
        setRecipientDocument(order.fiscal_recipient_document || '');
        setFreightMode(order.fiscal_freight_mode || (order.delivery_mode === 'pickup' ? 'none' : ''));
        setStreet(order.fiscal_destination_street || '');
        setNumber(order.fiscal_destination_number || '');
        setComplement(order.fiscal_destination_complement || '');
        setNeighborhood(order.fiscal_destination_neighborhood || '');
        setCity(order.fiscal_destination_city || '');
        setDestinationUf(order.fiscal_destination_uf || (order.delivery_mode === 'pickup' ? 'MT' : ''));
        setPostalCode(order.fiscal_destination_postal_code || '');
      } catch (loadError) {
        error('Falha ao carregar venda', loadError instanceof Error ? loadError.message : 'Não foi possível carregar todos os dados da venda.');
        onClose();
      } finally {
        setIsLoading(false);
      }
    }

    void loadSale();
  }, [open, orderId, supabase, error, onClose]);

  const subtotal = useMemo(() => items.reduce(
    (sum, item) => sum + decimal(item.quantity) * decimal(item.unit_price), 0
  ), [items]);
  const discount = Math.max(0, decimal(discountAmount));
  const total = Math.max(0, subtotal - discount);

  const updateItem = (key: string, patch: Partial<EditableItem>) => {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  };

  const chooseProduct = (key: string, productId: string) => {
    const product = products.find((entry) => entry.id === productId);
    updateItem(key, {
      product_id: productId,
      description: product?.name || '',
      unit_price: product ? inputDecimal(product.price) : '0'
    });
  };

  const addProduct = () => {
    const product = products.find((entry) => entry.id === productToAdd);
    if (!product) return;
    setItems((current) => [
      ...current,
      {
        key: itemKey(), item_type: 'PRODUCT', product_id: product.id,
        description: product.name, quantity: '1', unit_price: inputDecimal(product.price)
      }
    ]);
    setProductToAdd('');
  };

  const addService = () => {
    setItems((current) => [
      ...current,
      { key: itemKey(), item_type: 'SERVICE', product_id: '', description: '', quantity: '1', unit_price: '0' }
    ]);
  };

  const selectCustomer = (id: string) => {
    setCustomerId(id);
    const customer = customers.find((entry) => entry.id === id);
    if (!customer) return;
    setCustomerName(customer.full_name);
    setCustomerEmail(customer.email);
    setCustomerPhone(customer.phone);
    setRecipientDocument(customer.document);
    setStateRegistration(customer.state_registration);
    setTaxpayerIndicator(customer.taxpayer_indicator);
    setPurchasePurpose(customer.purchase_purpose);
    if (customer.address) {
      setStreet(customer.address.street);
      setNumber(customer.address.number);
      setComplement(customer.address.complement);
      setNeighborhood(customer.address.neighborhood);
      setCity(customer.address.city);
      setDestinationUf(customer.address.state);
      setPostalCode(customer.address.postal_code);
    }
  };

  const lookupCep = async (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    setPostalCode(digits);
    if (digits.length !== 8) return;
    setIsLookingUpCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!response.ok) throw new Error('Não foi possível consultar o CEP.');
      const address = await response.json() as { erro?: boolean; logradouro?: string; complemento?: string; bairro?: string; localidade?: string; uf?: string };
      if (address.erro) throw new Error('CEP não encontrado.');
      setStreet(address.logradouro || street);
      setComplement(address.complemento || complement);
      setNeighborhood(address.bairro || neighborhood);
      setCity(address.localidade || city);
      setDestinationUf(address.uf || destinationUf);
    } catch (cepError) {
      error('Erro ao consultar CEP', cepError instanceof Error ? cepError.message : 'Verifique o CEP informado.');
    } finally {
      setIsLookingUpCep(false);
    }
  };

  const save = async () => {
    if (!orderId) return;
    const cleanItems = items.map((item) => ({
      item_type: item.item_type,
      product_id: item.item_type === 'PRODUCT' ? item.product_id || null : null,
      description: item.description.trim(),
      quantity: decimal(item.quantity),
      unit_price: decimal(item.unit_price)
    }));

    if (!cleanItems.length || cleanItems.some((item) => !item.description || item.quantity <= 0 || item.unit_price < 0 || (item.item_type === 'PRODUCT' && !item.product_id))) {
      error('Itens incompletos', 'Preencha produto/descrição, quantidade e valor de todos os itens.');
      return;
    }
    if (subtotal <= 0 || discount > subtotal) {
      error('Total inválido', 'O total deve ser maior que zero e o desconto não pode superar o subtotal.');
      return;
    }
    if (quotationId && !title.trim()) {
      error('Título obrigatório', 'Informe o título da venda/orçamento.');
      return;
    }

    setIsSaving(true);
    try {
      const { error: mutationError } = await supabase.rpc('update_pending_counter_sale', {
        p_order_id: orderId,
        p_items: cleanItems,
        p_customer_id: customerId || null,
        p_customer_name: customerName.trim() || null,
        p_customer_email: customerEmail.trim() || null,
        p_customer_phone: customerPhone.trim() || null,
        p_title: title.trim() || null,
        p_vehicle_info: vehicleInfo.trim() || null,
        p_discount_amount: discount,
        p_notes: notes.trim() || null,
        p_delivery_mode: deliveryMode || null,
        p_purchase_purpose: purchasePurpose || null,
        p_taxpayer_indicator: taxpayerIndicator || null,
        p_state_registration: stateRegistration.trim() || null,
        p_recipient_document: recipientDocument.replace(/\D/g, '') || null,
        p_freight_mode: freightMode || null,
        p_destination_street: street.trim() || null,
        p_destination_number: number.trim() || null,
        p_destination_complement: complement.trim() || null,
        p_destination_neighborhood: neighborhood.trim() || null,
        p_destination_city: city.trim() || null,
        p_destination_uf: destinationUf || null,
        p_destination_postal_code: postalCode.replace(/\D/g, '') || null
      });
      if (mutationError) throw mutationError;
      success('Venda atualizada', 'Todos os dados da venda pendente foram salvos.');
      await onSaved();
      onClose();
    } catch (mutationError) {
      error('Falha ao editar venda', mutationError instanceof Error ? mutationError.message : 'Não foi possível salvar a venda.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => !isSaving && onClose()}
      title={orderId ? `Editar venda #${orderId.slice(0, 8).toUpperCase()}` : 'Editar venda'}
      size="xl"
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" disabled={isSaving} onClick={onClose}>Cancelar</Button>
          <Button type="button" size="sm" disabled={isSaving || isLoading} onClick={() => void save()}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSaving ? 'Salvando...' : 'Salvar venda completa'}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /><Skeleton className="h-44 w-full" /></div>
      ) : (
        <div className="space-y-5">
          <p className="text-xs font-mono text-brand-grey">As alterações abaixo serão aplicadas antes do pagamento e da baixa no estoque.</p>

          <Section title="1. Cliente e identificação">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-left md:col-span-2">
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-brand-grey">Cliente cadastrado (opcional)</span>
                <select value={customerId} onChange={(event) => selectCustomer(event.target.value)} className="w-full border border-brand-grey/20 bg-brand-darkgrey px-4 py-2.5 text-sm text-white outline-none focus:border-brand-red">
                  <option value="">Cliente avulso / não identificado</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}</option>)}
                </select>
              </label>
              <Input label="Nome do cliente" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
              <Input label="E-mail" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
              <Input label="Telefone / WhatsApp" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
              <Input label="CPF / CNPJ do destinatário" value={recipientDocument} onChange={(event) => setRecipientDocument(event.target.value.replace(/\D/g, '').slice(0, 14))} />
              {quotationId && <Input label="Título da venda / orçamento" value={title} onChange={(event) => setTitle(event.target.value)} />}
              {quotationId && <Input label="Veículo" value={vehicleInfo} onChange={(event) => setVehicleInfo(event.target.value)} />}
            </div>
          </Section>

          <Section title="2. Produtos e serviços">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row">
              <select value={productToAdd} onChange={(event) => setProductToAdd(event.target.value)} className="min-w-0 flex-1 border border-brand-grey/20 bg-brand-darkgrey px-3 py-2 text-xs text-white outline-none focus:border-brand-red">
                <option value="">Selecione um produto para adicionar</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.sku || 'SEM SKU'} - {product.name} ({product.stock_quantity} em estoque)</option>)}
              </select>
              <Button type="button" variant="secondary" size="sm" disabled={!productToAdd} onClick={addProduct}><PackagePlus className="h-4 w-4" />Adicionar produto</Button>
              <Button type="button" variant="secondary" size="sm" onClick={addService}><Wrench className="h-4 w-4" />Adicionar serviço</Button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => {
                const product = products.find((entry) => entry.id === item.product_id);
                return (
                  <div key={item.key} className="border border-brand-grey/15 bg-brand-card/50 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-grey">{index + 1}. {item.item_type === 'PRODUCT' ? 'Produto' : 'Serviço'}</span>
                      <button type="button" onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))} className="text-brand-grey hover:text-brand-red" aria-label="Remover item"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                      {item.item_type === 'PRODUCT' && (
                        <label className="flex flex-col gap-1 md:col-span-5">
                          <span className="text-[10px] font-mono uppercase text-brand-grey">Produto</span>
                          <select value={item.product_id} onChange={(event) => chooseProduct(item.key, event.target.value)} className="h-[42px] border border-brand-grey/20 bg-brand-darkgrey px-3 text-xs text-white outline-none focus:border-brand-red">
                            <option value="">Selecione</option>
                            {products.map((entry) => <option key={entry.id} value={entry.id}>{entry.sku || 'SEM SKU'} - {entry.name}</option>)}
                          </select>
                        </label>
                      )}
                      <div className={item.item_type === 'PRODUCT' ? 'md:col-span-3' : 'md:col-span-8'}>
                        <Input label="Descrição" value={item.description} onChange={(event) => updateItem(item.key, { description: event.target.value })} />
                      </div>
                      <div className="md:col-span-2"><Input label="Quantidade" inputMode="decimal" value={item.quantity} onChange={(event) => updateItem(item.key, { quantity: event.target.value })} /></div>
                      <div className="md:col-span-2"><Input label="Valor unitário" inputMode="decimal" value={item.unit_price} onChange={(event) => updateItem(item.key, { unit_price: event.target.value })} /></div>
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] font-mono text-brand-grey">
                      <span>{product ? `Estoque atual: ${product.stock_quantity}` : item.item_type === 'SERVICE' ? 'Serviço sem movimentação de estoque' : 'Selecione um produto'}</span>
                      <strong className="text-white">Total: {money(decimal(item.quantity) * decimal(item.unit_price))}</strong>
                    </div>
                  </div>
                );
              })}
              {!items.length && <div className="py-8 text-center text-xs font-mono text-brand-grey">Adicione pelo menos um produto ou serviço.</div>}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-brand-grey/15 pt-4 md:grid-cols-2">
              <Input label="Desconto total" inputMode="decimal" value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} />
              <div className="space-y-1 bg-brand-black/50 p-3 font-mono text-xs">
                <div className="flex justify-between text-brand-grey"><span>Subtotal</span><span>{money(subtotal)}</span></div>
                <div className="flex justify-between text-brand-grey"><span>Desconto</span><span>- {money(discount)}</span></div>
                <div className="flex justify-between border-t border-brand-grey/15 pt-2 text-sm font-bold text-white"><span>Total da venda</span><span>{money(total)}</span></div>
              </div>
            </div>
          </Section>

          <Section title="3. Contexto fiscal e destino">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Select label="Destino da mercadoria" value={deliveryMode} onChange={(event) => { setDeliveryMode(event.target.value); if (event.target.value === 'pickup') setFreightMode('none'); }} options={deliveryOptions} />
              <Select label="Situação perante o ICMS" value={taxpayerIndicator} onChange={(event) => setTaxpayerIndicator(event.target.value)} options={taxpayerOptions} />
              <Select label="Finalidade da compra" value={purchasePurpose} onChange={(event) => setPurchasePurpose(event.target.value)} options={purposeOptions} />
              <Select label="Modalidade do frete" value={freightMode} onChange={(event) => setFreightMode(event.target.value)} options={freightOptions} />
              <Input label="Inscrição estadual" value={stateRegistration} onChange={(event) => setStateRegistration(event.target.value)} />
              <div className="relative"><Input label="CEP" inputMode="numeric" maxLength={8} value={postalCode} onChange={(event) => void lookupCep(event.target.value)} />{isLookingUpCep && <Loader2 className="absolute bottom-3 right-3 h-4 w-4 animate-spin text-brand-red" />}</div>
              <Input label="Logradouro / Rua" value={street} onChange={(event) => setStreet(event.target.value)} />
              <Input label="Número" value={number} onChange={(event) => setNumber(event.target.value)} />
              <Input label="Complemento" value={complement} onChange={(event) => setComplement(event.target.value)} />
              <Input label="Bairro" value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)} />
              <Input label="Cidade" value={city} onChange={(event) => setCity(event.target.value)} />
              <Select label="Estado (UF)" value={destinationUf} onChange={(event) => setDestinationUf(event.target.value)} options={[{ value: '', label: 'Selecione' }, ...BRAZILIAN_UFS.map((uf) => ({ value: uf, label: uf }))]} />
            </div>
          </Section>

          <Section title="4. Observações">
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} className="w-full resize-y border border-brand-grey/20 bg-brand-darkgrey px-4 py-3 text-sm text-white outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red" placeholder="Informações adicionais da venda" />
          </Section>
        </div>
      )}
    </Modal>
  );
}
