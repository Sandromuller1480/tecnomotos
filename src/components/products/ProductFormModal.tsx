'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { AlertTriangle, CheckCircle2, Image as ImageIcon, PackageSearch } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { isValidGtin, type ProductFormValues } from '@/lib/products/schema';

export interface ProductFormState extends Omit<ProductFormValues, 'price' | 'stockQuantity' | 'minStock'> {
  price: string;
  stockQuantity: string;
  minStock: string;
}

export type ProductFieldErrors = Partial<Record<keyof ProductFormState, string>>;

interface ProductFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  value: ProductFormState;
  currentBalance?: number;
  fiscalStatus?: 'pending' | 'review_required' | 'complete';
  purchaseInfo?: { lastCost?: number | null; averageCost?: number | null; lastPurchaseAt?: string | null };
  categories: string[];
  errors: ProductFieldErrors;
  isSaving: boolean;
  imageFile: File | null;
  onChange: (field: keyof ProductFormState, value: string | boolean) => void;
  onImageChange: (file: File | null) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onAdjustStock?: (delta: number, reason: string) => Promise<void>;
}

const originOptions = [
  { value: '', label: 'Selecione a origem' },
  { value: '0', label: '0 - Nacional' },
  { value: '1', label: '1 - Estrangeira: importação direta' },
  { value: '2', label: '2 - Estrangeira: adquirida no mercado interno' },
  { value: '3', label: '3 - Nacional, conteúdo de importação superior a 40%' },
  { value: '4', label: '4 - Nacional, produção conforme processos básicos' },
  { value: '5', label: '5 - Nacional, conteúdo de importação até 40%' },
  { value: '6', label: '6 - Estrangeira: importação direta sem similar nacional' },
  { value: '7', label: '7 - Estrangeira: mercado interno sem similar nacional' },
  { value: '8', label: '8 - Nacional, conteúdo de importação superior a 70%' }
];

const unitOptions = [
  { value: 'UN', label: 'UN - Unidade' },
  { value: 'PAR', label: 'PAR - Par' },
  { value: 'KIT', label: 'KIT - Kit' },
  { value: 'L', label: 'L - Litro' },
  { value: 'KG', label: 'KG - Quilograma' },
  { value: 'M', label: 'M - Metro' }
];

const brlCurrencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatBrlCurrency(value: string) {
  const amount = Number(value);
  return brlCurrencyFormatter.format(Number.isFinite(amount) ? amount : 0);
}

function currencyInputToDecimal(value: string) {
  const digits = value.replace(/\D/g, '');
  return (Number(digits || '0') / 100).toFixed(2);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded border border-brand-grey/15 bg-black/15 p-4">
      <legend className="px-2 text-xs font-black uppercase tracking-widest text-white">{title}</legend>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function ProductFormModal(props: ProductFormModalProps) {
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustment, setAdjustment] = useState('');
  const [reason, setReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const previewUrl = useMemo(() => props.imageFile ? URL.createObjectURL(props.imageFile) : null, [props.imageFile]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const identificationComplete = /^\d{8}$/.test(props.value.ncm)
    && props.value.fiscalOrigin !== ''
    && Boolean(props.value.fiscalUnit)
    && (props.value.withoutGtin || isValidGtin(props.value.gtin));
  const status = props.fiscalStatus === 'complete' && identificationComplete
    ? 'complete'
    : props.fiscalStatus === 'review_required' ? 'review_required' : 'pending';
  const statusContent = status === 'complete'
    ? { label: 'Dados fiscais do produto completos', icon: CheckCircle2, className: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' }
    : status === 'review_required'
      ? { label: 'Revisão fiscal necessária', icon: AlertTriangle, className: 'text-amber-400 border-amber-500/30 bg-amber-500/10' }
      : { label: 'Classificação fiscal pendente', icon: PackageSearch, className: 'text-brand-grey border-brand-grey/25 bg-white/5' };
  const StatusIcon = statusContent.icon;

  const adjust = async () => {
    if (!props.onAdjustStock) return;
    setAdjusting(true);
    try {
      await props.onAdjustStock(Number(adjustment), reason);
      setAdjustment('');
      setReason('');
      setShowAdjustment(false);
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={props.mode === 'create' ? 'Cadastrar novo produto' : 'Editar produto'}
      size="xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={props.onClose} disabled={props.isSaving}>Cancelar</Button>
          <Button type="submit" form="product-form" disabled={props.isSaving}>
            {props.isSaving ? 'Salvando...' : props.mode === 'create' ? 'Salvar produto' : 'Salvar alterações'}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={props.onSubmit} className="space-y-5 pr-1" noValidate>
        <Section title="A. Identificação">
          <div className="md:col-span-2">
            <Input label="Nome do produto *" autoFocus value={props.value.name} error={props.errors.name} onChange={(e) => props.onChange('name', e.target.value)} />
          </div>
          <Input label="SKU" placeholder="Gerado automaticamente se vazio" value={props.value.sku} error={props.errors.sku} onChange={(e) => props.onChange('sku', e.target.value)} />
          <Input label="Marca" value={props.value.brand} error={props.errors.brand} onChange={(e) => props.onChange('brand', e.target.value)} />
          <div>
            <Input label="Categoria comercial" list="product-categories" placeholder="Digite para buscar" value={props.value.category} error={props.errors.category} onChange={(e) => props.onChange('category', e.target.value)} />
            <datalist id="product-categories">{props.categories.map((category) => <option key={category} value={category} />)}</datalist>
          </div>
          <Input label="Localização de estoque" value={props.value.location} error={props.errors.location} onChange={(e) => props.onChange('location', e.target.value)} />
        </Section>

        <Section title="B. Preço e estoque">
          <Input
            label="Preço de venda"
            type="text"
            inputMode="numeric"
            value={formatBrlCurrency(props.value.price)}
            error={props.errors.price}
            onFocus={(event) => {
              if (Number(props.value.price || 0) === 0) event.currentTarget.select();
            }}
            onMouseUp={(event) => {
              if (Number(props.value.price || 0) === 0) {
                event.preventDefault();
                event.currentTarget.select();
              }
            }}
            onChange={(event) => props.onChange('price', currencyInputToDecimal(event.target.value))}
          />
          <Input
            label="Estoque mínimo"
            type="number"
            min="0"
            step="0.001"
            value={props.value.minStock}
            error={props.errors.minStock}
            onFocus={(event) => {
              if (Number(props.value.minStock || 0) === 0) event.currentTarget.select();
            }}
            onKeyDown={(event) => {
              if (!event.ctrlKey && !event.metaKey && !event.altKey && Number(props.value.minStock || 0) === 0 && /^\d$/.test(event.key)) {
                event.preventDefault();
                props.onChange('minStock', event.key);
              }
            }}
            onChange={(event) => props.onChange('minStock', event.target.value)}
          />
          {props.mode === 'create' ? (
            <Input label="Estoque inicial" type="number" min="0" step="0.001" value={props.value.stockQuantity} error={props.errors.stockQuantity} onChange={(e) => props.onChange('stockQuantity', e.target.value)} />
          ) : (
            <div className="space-y-2">
              <Input label="Saldo atual" value={String(props.currentBalance ?? 0)} readOnly aria-readonly="true" />
              {props.onAdjustStock && <Button type="button" variant="secondary" size="sm" onClick={() => setShowAdjustment((current) => !current)}>Ajustar estoque</Button>}
            </div>
          )}
          {showAdjustment && (
            <div className="md:col-span-2 grid grid-cols-1 gap-3 rounded border border-amber-500/25 bg-amber-500/5 p-3 md:grid-cols-[160px_1fr_auto] md:items-end">
              <Input label="Ajuste (+ ou -)" type="number" step="0.001" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} />
              <Input label="Motivo *" minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button type="button" size="sm" disabled={adjusting || !adjustment || reason.trim().length < 5} onClick={adjust}>{adjusting ? 'Registrando...' : 'Registrar ajuste'}</Button>
            </div>
          )}
          {props.mode === 'edit' && (
            <div className="md:col-span-2 grid gap-3 border border-brand-grey/15 bg-black/20 p-3 md:grid-cols-3">
              <div><p className="text-[10px] uppercase tracking-widest text-brand-grey">Último custo de compra</p><p className="mt-1 font-mono font-bold text-white">{props.purchaseInfo?.lastCost == null ? 'Sem compra vinculada' : Number(props.purchaseInfo.lastCost).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
              <div><p className="text-[10px] uppercase tracking-widest text-brand-grey">Custo médio</p><p className="mt-1 font-mono font-bold text-white">{props.purchaseInfo?.averageCost == null ? '—' : Number(props.purchaseInfo.averageCost).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
              <div><p className="text-[10px] uppercase tracking-widest text-brand-grey">Última entrada</p><p className="mt-1 font-mono font-bold text-white">{props.purchaseInfo?.lastPurchaseAt ? new Date(props.purchaseInfo.lastPurchaseAt).toLocaleDateString('pt-BR') : '—'}</p></div>
            </div>
          )}
        </Section>

        <Section title="C. Identificação fiscal do produto">
          <p className="md:col-span-2 text-xs leading-relaxed text-brand-grey">
            Informe os dados da mercadoria. Os códigos de emissão são calculados automaticamente conforme as regras fiscais da empresa.
          </p>
          <Input label="NCM" inputMode="numeric" maxLength={8} placeholder="8 dígitos" value={props.value.ncm} error={props.errors.ncm} onChange={(e) => props.onChange('ncm', e.target.value.replace(/\D/g, '').slice(0, 8))} />
          <Input label="CEST (quando aplicável)" inputMode="numeric" maxLength={7} placeholder="7 dígitos" value={props.value.cest} error={props.errors.cest} onChange={(e) => props.onChange('cest', e.target.value.replace(/\D/g, '').slice(0, 7))} />
          <Select label="Origem da mercadoria" value={props.value.fiscalOrigin} error={props.errors.fiscalOrigin} options={originOptions} onChange={(e) => props.onChange('fiscalOrigin', e.target.value)} />
          <Select label="Unidade comercial" value={props.value.fiscalUnit} error={props.errors.fiscalUnit} options={unitOptions} onChange={(e) => props.onChange('fiscalUnit', e.target.value)} />
          <div className="space-y-2 md:col-span-2">
            <Input label="GTIN / código de barras" inputMode="numeric" maxLength={14} disabled={props.value.withoutGtin} value={props.value.gtin} error={props.errors.gtin} onChange={(e) => props.onChange('gtin', e.target.value.replace(/\D/g, '').slice(0, 14))} />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-white">
              <input type="checkbox" checked={props.value.withoutGtin} onChange={(e) => props.onChange('withoutGtin', e.target.checked)} /> Produto sem GTIN
            </label>
          </div>
          <div className={`md:col-span-2 flex items-center gap-2 rounded border p-3 ${statusContent.className}`}>
            <StatusIcon className="h-4 w-4" />
            <div><p className="text-xs font-bold uppercase">{statusContent.label}</p><p className="mt-1 text-[11px] text-brand-grey">A prontidão será validada novamente para cada operação e destino.</p></div>
          </div>
        </Section>

        <Section title="D. Loja virtual e imagem">
          <label className="md:col-span-2 flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
            <input type="checkbox" checked={props.value.showInStore} onChange={(e) => props.onChange('showInStore', e.target.checked)} /> Disponibilizar produto na loja virtual
          </label>
          <div className="md:col-span-2 space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-brand-grey">Imagem do produto</label>
            <input type="file" accept="image/*" onChange={(e) => props.onImageChange(e.target.files?.[0] || null)} className="w-full border border-brand-grey/20 bg-brand-darkgrey p-2 text-xs text-brand-grey file:mr-3 file:border-0 file:bg-brand-red file:px-3 file:py-2 file:text-white" />
            {previewUrl ? <Image src={previewUrl} alt="Prévia do produto" width={112} height={112} unoptimized className="h-28 w-28 rounded border border-brand-grey/20 object-cover" /> : <div className="flex h-20 items-center justify-center gap-2 border border-dashed border-brand-grey/20 text-xs text-brand-grey"><ImageIcon className="h-4 w-4" /> Nenhuma nova imagem selecionada</div>}
          </div>
        </Section>
        {Object.keys(props.errors).length > 0 && <Badge variant="danger">Revise os campos destacados antes de salvar.</Badge>}
      </form>
    </Modal>
  );
}
