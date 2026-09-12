'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Wrench,
  Plus,
  Search,
  X,
  Check,
  User,
  Bike,
  ClipboardList,
  Calendar,
  AlertTriangle,
  Play,
  CheckSquare,
  Slash,
  Camera,
  ImageIcon,
  Trash2
} from 'lucide-react';

interface ServiceOrder {
  id: string;
  customer_id: string;
  vehicle_id: string;
  employee_id: string | null;
  service_type: string;
  description: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  total_price: number;
  notes: string | null;
  created_at: string;
  customer?: {
    full_name: string;
  };
  vehicle?: {
    brand: string;
    model: string;
    plate: string;
  };
  mechanic?: {
    full_name: string;
  };
}

interface CustomerOption {
  id: string;
  full_name: string;
}

interface VehicleOption {
  id: string;
  brand: string;
  model: string;
  plate: string;
}

interface MechanicOption {
  id: string;
  full_name: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  stock_quantity: number | null;
}

type ChecklistStatus = 'OK' | 'ATTENTION' | 'DAMAGED' | 'NOT_APPLICABLE';

interface ChecklistItem {
  id?: string;
  label: string;
  status: ChecklistStatus;
  notes: string;
  sort_order: number;
}

interface ServiceOrderPhoto {
  id: string;
  service_order_id: string;
  image_url: string;
  storage_path: string;
  caption: string | null;
  created_at: string;
}

interface ServiceOrderProduct {
  id?: string;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  price: number | string | null;
  stock_quantity: number | null;
}

interface ServiceOrderProductRow extends Omit<ServiceOrderProduct, 'quantity' | 'unit_price' | 'total_price'> {
  quantity: number | string | null;
  unit_price: number | string | null;
  total_price: number | string | null;
}

const DEFAULT_CHECKLIST_ITEMS: ChecklistItem[] = [
  { label: 'Carenagens e pintura', status: 'OK', notes: '', sort_order: 1 },
  { label: 'Retrovisores', status: 'OK', notes: '', sort_order: 2 },
  { label: 'Manetes e pedais', status: 'OK', notes: '', sort_order: 3 },
  { label: 'Pneus e rodas', status: 'OK', notes: '', sort_order: 4 },
  { label: 'Freios', status: 'OK', notes: '', sort_order: 5 },
  { label: 'Corrente, coroa e pinhao', status: 'OK', notes: '', sort_order: 6 },
  { label: 'Luzes, setas e painel', status: 'OK', notes: '', sort_order: 7 },
  { label: 'Vazamentos aparentes', status: 'OK', notes: '', sort_order: 8 },
  { label: 'Nivel de combustivel', status: 'OK', notes: '', sort_order: 9 },
  { label: 'Acessorios e bau', status: 'OK', notes: '', sort_order: 10 }
];

export default function AdminWorkshopPage() {
  const router = useRouter();
  const supabase = createClient();
  const { success, error, info } = useToast();

  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [mechanics, setMechanics] = useState<MechanicOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Create Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

  const [selectedCustId, setSelectedCustId] = useState('');
  const [selectedVehId, setSelectedVehId] = useState('');
  const [selectedMechId, setSelectedMechId] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [description, setDescription] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST_ITEMS);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);

  // Edit / Details Modal States
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedSO, setSelectedSO] = useState<ServiceOrder | null>(null);
  const [showEditSuccessOverlay, setShowEditSuccessOverlay] = useState(false);
  const [eMechId, setEMechId] = useState('');
  const [eServiceType, setEServiceType] = useState('');
  const [eDescription, setEDescription] = useState('');
  const [eTotalPrice, setETotalPrice] = useState('');
  const [eNotes, setENotes] = useState('');
  const [eChecklistItems, setEChecklistItems] = useState<ChecklistItem[]>([]);
  const [serviceOrderProducts, setServiceOrderProducts] = useState<ServiceOrderProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProductQuantity, setSelectedProductQuantity] = useState('1');
  const [serviceOrderPhotos, setServiceOrderPhotos] = useState<ServiceOrderPhoto[]>([]);
  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);

  const fetchServiceOrders = async () => {
    try {
      const { data, error: fetchErr } = await supabase
        .from('service_orders')
        .select(`
          id,
          customer_id,
          vehicle_id,
          employee_id,
          service_type,
          description,
          status,
          total_price,
          notes,
          created_at,
          customer:customers!service_orders_customer_id_fkey (
            id,
            profiles!customers_id_fkey (
              full_name
            )
          ),
          vehicle:customer_vehicles!service_orders_vehicle_id_fkey (
            brand,
            model,
            plate
          ),
          employee:employees!service_orders_employee_id_fkey (
            id,
            profiles!employees_id_fkey (
              full_name
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      const formatted = (data || []).map((so: any) => {
        // Resolve customer profile
        const custProfile = so.customer?.profiles;
        const custName = Array.isArray(custProfile) 
          ? custProfile[0]?.full_name 
          : custProfile?.full_name || 'Desconhecido';

        // Resolve mechanic profile
        const mechProfile = so.employee?.profiles;
        const mechName = Array.isArray(mechProfile)
          ? mechProfile[0]?.full_name
          : mechProfile?.full_name || 'Não alocado';

        return {
          id: so.id,
          customer_id: so.customer_id,
          vehicle_id: so.vehicle_id,
          employee_id: so.employee_id,
          service_type: so.service_type,
          description: so.description,
          status: so.status,
          total_price: parseFloat(so.total_price) || 0,
          notes: so.notes,
          created_at: so.created_at,
          customer: { full_name: custName },
          vehicle: so.vehicle ? {
            brand: so.vehicle.brand,
            model: so.vehicle.model,
            plate: so.vehicle.plate
          } : undefined,
          mechanic: { full_name: mechName }
        };
      });

      setServiceOrders(formatted as ServiceOrder[]);
    } catch (e: unknown) {
      console.warn('[Workshop] Fetch orders failed: ', e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFormOptions = async () => {
    try {
      // Fetch customers
      const { data: custs } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          customers ( id )
        `)
        .order('full_name');

      const formattedCusts = (custs || [])
        .filter((item: any) => item.customers)
        .map((item: any) => ({
          id: item.id,
          full_name: item.full_name
        }));
      setCustomers(formattedCusts);

      // Fetch mechanics/employees
      const { data: emps } = await supabase
        .from('employees')
        .select(`
          id,
          profiles: id (
            full_name
          )
        `);

      const formattedEmps = (emps || []).map((item: any) => {
        const p = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
        return {
          id: item.id,
          full_name: p?.full_name || 'Funcionário'
        };
      });
      setMechanics(formattedEmps);

      const { data: prods } = await supabase
        .from('products')
        .select('id, name, sku, price, stock_quantity')
        .order('name', { ascending: true });

      setProducts(((prods || []) as ProductRow[]).map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku || null,
        price: parseFloat(String(product.price)) || 0,
        stock_quantity: product.stock_quantity ?? null
      })));
    } catch (e) {
      console.warn('[Workshop] Error fetching form options:', e);
    }
  };

  useEffect(() => {
    async function checkAuthAndLoad() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: hasView } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'service_orders.view'
      });

      if (!hasView) {
        router.push('/403');
        return;
      }

      const { data: hasCreate } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'service_orders.create'
      });

      setIsOwner(!!hasCreate);
      await fetchServiceOrders();
      await fetchFormOptions();
    }

    checkAuthAndLoad();
  }, []);

  // Fetch vehicles dynamic filter
  useEffect(() => {
    async function fetchCustomerVehicles() {
      if (!selectedCustId) {
        setVehicles([]);
        return;
      }

      const { data: vehs } = await supabase
        .from('customer_vehicles')
        .select('id, brand, model, plate')
        .eq('customer_id', selectedCustId)
        .order('brand');

      setVehicles(vehs || []);
    }

    fetchCustomerVehicles();
  }, [selectedCustId]);

  const updateChecklistItem = (
    setter: React.Dispatch<React.SetStateAction<ChecklistItem[]>>,
    index: number,
    field: 'status' | 'notes',
    value: string
  ) => {
    setter((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: field === 'status' ? value as ChecklistStatus : value } : item
    )));
  };

  const uploadServiceOrderPhotos = async (serviceOrderId: string, files: File[]) => {
    if (files.length === 0) return;

    const photoRows = [];
    for (const file of files) {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const safeName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9.-]/g, '-');
      const filePath = `${serviceOrderId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('service-order-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('service-order-photos')
        .getPublicUrl(filePath);

      photoRows.push({
        service_order_id: serviceOrderId,
        image_url: urlData.publicUrl,
        storage_path: filePath,
        caption: file.name
      });
    }

    const { error: photoErr } = await supabase
      .from('service_order_photos')
      .insert(photoRows);

    if (photoErr) throw photoErr;
  };

  const handleAddServiceOrderProduct = () => {
    const product = products.find((item) => item.id === selectedProductId);
    const quantity = parseFloat(selectedProductQuantity.replace(',', '.')) || 0;

    if (!product || quantity <= 0) {
      error('Produto obrigatorio', 'Selecione um produto e informe uma quantidade valida.');
      return;
    }

    const existingIndex = serviceOrderProducts.findIndex((item) => item.product_id === product.id);
    const nextItem: ServiceOrderProduct = {
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      quantity,
      unit_price: product.price,
      total_price: quantity * product.price
    };

    setServiceOrderProducts((current) => {
      if (existingIndex === -1) return [...current, nextItem];

      return current.map((item, index) => {
        if (index !== existingIndex) return item;
        const nextQuantity = item.quantity + quantity;
        return {
          ...item,
          quantity: nextQuantity,
          unit_price: product.price,
          total_price: nextQuantity * product.price
        };
      });
    });

    setSelectedProductId('');
    setSelectedProductQuantity('1');
  };

  const handleRemoveServiceOrderProduct = (index: number) => {
    setServiceOrderProducts((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const resetCreateForm = () => {
    setSelectedCustId('');
    setSelectedVehId('');
    setSelectedMechId('');
    setServiceType('');
    setDescription('');
    setTotalPrice('');
    setNotes('');
    setChecklistItems(DEFAULT_CHECKLIST_ITEMS);
    setPhotoFiles([]);
  };

  const handleConfirmCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustId || !selectedVehId || !serviceType) {
      error('Campos Obrigatórios', 'Cliente, Veículo e Tipo de Serviço são necessários.');
      return;
    }

    setIsSaving(true);
    try {
      const { data: insertedOrder, error: insErr } = await supabase
        .from('service_orders')
        .insert({
          customer_id: selectedCustId,
          vehicle_id: selectedVehId,
          employee_id: selectedMechId || null,
          service_type: serviceType,
          description: description || null,
          total_price: parseFloat(totalPrice) || 0.00,
          notes: notes || null,
          status: 'PENDING'
        })
        .select('id')
        .single();

      if (insErr) throw insErr;

      const orderId = insertedOrder.id;
      const { error: checklistErr } = await supabase
        .from('service_order_checklist_items')
        .insert(checklistItems.map((item) => ({
          service_order_id: orderId,
          label: item.label,
          status: item.status,
          notes: item.notes || null,
          sort_order: item.sort_order
        })));

      if (checklistErr) throw checklistErr;

      await uploadServiceOrderPhotos(orderId, photoFiles);

      resetCreateForm();
      setIsCreateModalOpen(false);
      setShowSuccessOverlay(true);
      setTimeout(() => {
        setShowSuccessOverlay(false);
      }, 2500);

      await fetchServiceOrders();
    } catch (err: any) {
      error('Erro ao salvar', err.message || 'Falha ao criar OS.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelarCadastro = () => {
    if (selectedCustId || serviceType || description) {
      resetCreateForm();
      info('Campos Limpos', 'O formulário foi resetado.');
    }
  };

  // Details & Status Actions
  const handleOpenDetails = async (so: ServiceOrder) => {
    setSelectedSO(so);
    setEMechId(so.employee_id || '');
    setEServiceType(so.service_type);
    setEDescription(so.description || '');
    setETotalPrice(so.total_price.toString());
    setENotes(so.notes || '');
    setServiceOrderProducts([]);
    setSelectedProductId('');
    setSelectedProductQuantity('1');
    setNewPhotoFiles([]);
    setIsDetailModalOpen(true);

    const { data: checklist } = await supabase
      .from('service_order_checklist_items')
      .select('id, label, status, notes, sort_order')
      .eq('service_order_id', so.id)
      .order('sort_order', { ascending: true });

    setEChecklistItems((checklist || []).length > 0
      ? (checklist || []).map((item: any) => ({
          id: item.id,
          label: item.label,
          status: item.status as ChecklistStatus,
          notes: item.notes || '',
          sort_order: item.sort_order
        }))
      : DEFAULT_CHECKLIST_ITEMS
    );

    const { data: photos } = await supabase
      .from('service_order_photos')
      .select('id, service_order_id, image_url, storage_path, caption, created_at')
      .eq('service_order_id', so.id)
      .order('created_at', { ascending: false });

    setServiceOrderPhotos(photos || []);

    const { data: orderProducts, error: orderProductsErr } = await supabase
      .from('service_order_products')
      .select('id, product_id, product_name, product_sku, quantity, unit_price, total_price')
      .eq('service_order_id', so.id)
      .order('created_at', { ascending: true });

    if (!orderProductsErr) {
      setServiceOrderProducts(((orderProducts || []) as ServiceOrderProductRow[]).map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.product_sku,
        quantity: parseFloat(String(item.quantity)) || 0,
        unit_price: parseFloat(String(item.unit_price)) || 0,
        total_price: parseFloat(String(item.total_price)) || 0
      })));
    }
  };

  const handleUpdateSO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSO) return;

    try {
      const { error: err } = await supabase
        .from('service_orders')
        .update({
          employee_id: eMechId || null,
          service_type: eServiceType,
          description: eDescription || null,
          total_price: parseFloat(eTotalPrice) || 0.00,
          notes: eNotes || null
        })
        .eq('id', selectedSO.id);

      if (err) throw err;

      const { error: deleteChecklistErr } = await supabase
        .from('service_order_checklist_items')
        .delete()
        .eq('service_order_id', selectedSO.id);

      if (deleteChecklistErr) throw deleteChecklistErr;

      const { error: checklistErr } = await supabase
        .from('service_order_checklist_items')
        .insert(eChecklistItems.map((item) => ({
          service_order_id: selectedSO.id,
          label: item.label,
          status: item.status,
          notes: item.notes || null,
          sort_order: item.sort_order
        })));

      if (checklistErr) throw checklistErr;

      const { error: deleteProductsErr } = await supabase
        .from('service_order_products')
        .delete()
        .eq('service_order_id', selectedSO.id);

      if (deleteProductsErr) throw deleteProductsErr;

      if (serviceOrderProducts.length > 0) {
        const { error: productsErr } = await supabase
          .from('service_order_products')
          .insert(serviceOrderProducts.map((item) => ({
            service_order_id: selectedSO.id,
            product_id: item.product_id,
            product_name: item.product_name,
            product_sku: item.product_sku,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price
          })));

        if (productsErr) throw productsErr;
      }

      await uploadServiceOrderPhotos(selectedSO.id, newPhotoFiles);

      setIsDetailModalOpen(false);
      setShowEditSuccessOverlay(true);
      setTimeout(() => {
        setShowEditSuccessOverlay(false);
      }, 2500);

      await fetchServiceOrders();
    } catch (err: any) {
      error('Erro de Atualização', err.message);
    }
  };

  const handleDeletePhoto = async (photo: ServiceOrderPhoto) => {
    try {
      const { error: storageErr } = await supabase.storage
        .from('service-order-photos')
        .remove([photo.storage_path]);

      if (storageErr) throw storageErr;

      const { error: deleteErr } = await supabase
        .from('service_order_photos')
        .delete()
        .eq('id', photo.id);

      if (deleteErr) throw deleteErr;

      setServiceOrderPhotos((current) => current.filter((item) => item.id !== photo.id));
      success('Foto Excluida', 'Registro fotografico removido.');
    } catch (err: any) {
      error('Erro ao excluir foto', err.message);
    }
  };

  const updateStatus = async (status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED') => {
    if (!selectedSO) return;

    try {
      const { error: err } = await supabase
        .from('service_orders')
        .update({ status })
        .eq('id', selectedSO.id);

      if (err) throw err;

      const statusLabels = {
        PENDING: 'Pendente',
        IN_PROGRESS: 'Em andamento',
        COMPLETED: 'Concluída',
        CANCELLED: 'Cancelada'
      };
      success('Status Atualizado', `Ordem de serviço movida para ${statusLabels[status]}.`);
      setIsDetailModalOpen(false);
      await fetchServiceOrders();
    } catch (err: any) {
      error('Erro ao atualizar status', err.message);
    }
  };

  const filteredOrders = serviceOrders.filter((so) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query || (
      so.customer?.full_name.toLowerCase().includes(query) ||
      so.service_type.toLowerCase().includes(query) ||
      (so.vehicle && so.vehicle.plate.toLowerCase().includes(query)) ||
      (so.vehicle && so.vehicle.model.toLowerCase().includes(query))
    );

    const matchesStatus = statusFilter === 'ALL' || so.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 text-left">
      <div>
        <Breadcrumb items={[{ label: 'Oficina' }, { label: 'Ordens de Serviço' }]} />
        <div className="flex justify-between items-center mt-2 border-b border-brand-grey/15 pb-4">
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
              Oficina Mecânica
            </h1>
            <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
              Controle ordens de serviço, checklist de entrada e mecânicos alocados
            </p>
          </div>
          {isOwner && (
            <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Nova Ordem de Serviço
            </Button>
          )}
        </div>
      </div>

      <Card>
        {/* Search & Status Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative w-full max-w-sm">
            <Input
              placeholder="Buscar por cliente, serviço, placa ou modelo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs font-mono bg-brand-input"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey/60 pointer-events-none z-10" />
          </div>

          {/* Status Tabs */}
          <div className="flex bg-brand-black p-1 border border-brand-grey/10 rounded font-mono text-[10px] uppercase">
            {[
              { id: 'ALL', label: 'Todas' },
              { id: 'PENDING', label: 'Pendente' },
              { id: 'IN_PROGRESS', label: 'Em Andamento' },
              { id: 'COMPLETED', label: 'Concluído' },
              { id: 'CANCELLED', label: 'Cancelado' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded transition-colors ${statusFilter === tab.id ? 'bg-brand-red text-white font-bold' : 'text-brand-grey hover:text-white'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-12 text-center text-brand-grey font-mono text-xs">
            Nenhuma ordem de serviço correspondente encontrada.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OS / Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Motocicleta</TableHead>
                <TableHead>Serviço Solicitado</TableHead>
                <TableHead>Mecânico Alocado</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((so) => (
                <TableRow key={so.id}>
                  <TableCell className="font-mono text-xs text-brand-red">
                    <div>#{so.id.slice(0, 8).toUpperCase()}</div>
                    <div className="text-[10px] text-brand-grey mt-0.5">
                      {new Date(so.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </TableCell>
                  <TableCell className="font-bold text-white">{so.customer?.full_name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {so.vehicle ? (
                      <div>
                        <div className="text-white">{so.vehicle.brand} {so.vehicle.model}</div>
                        <div className="text-brand-grey text-[10px] mt-0.5">{so.vehicle.plate}</div>
                      </div>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-white font-bold">{so.service_type}</TableCell>
                  <TableCell>{so.mechanic?.full_name || '-'}</TableCell>
                  <TableCell className="font-mono text-white">
                    R$ {so.total_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    {so.status === 'PENDING' && (
                      <Badge variant="neutral" className="text-[9px] bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">PENDENTE</Badge>
                    )}
                    {so.status === 'IN_PROGRESS' && (
                      <Badge variant="neutral" className="text-[9px] bg-sky-500/15 text-sky-400 border border-sky-500/25">EM ANDAMENTO</Badge>
                    )}
                    {so.status === 'COMPLETED' && (
                      <Badge variant="success" className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">REALIZADO</Badge>
                    )}
                    {so.status === 'CANCELLED' && (
                      <Badge variant="danger" className="text-[9px] bg-red-500/15 text-red-400 border border-red-500/25">CANCELADO</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="secondary" size="sm" onClick={() => handleOpenDetails(so)}>
                      Gerenciar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* CREATE MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-2xl mx-4 relative p-6 space-y-6 max-h-[90vh] overflow-y-auto" withStripe>
            <button
              onClick={() => {
                setIsCreateModalOpen(false);
                resetCreateForm();
              }}
              className="absolute top-4 right-4 text-brand-grey hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-lg font-black italic uppercase tracking-tight text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-brand-red" />
                Nova Ordem de Serviço
              </h3>
              <p className="text-[10px] text-brand-grey font-mono uppercase tracking-widest mt-1">
                Gere check-ins de oficina e associe mecânicos especialistas
              </p>
            </div>

            <form onSubmit={handleConfirmCreate} className="space-y-4 text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Cliente</label>
                  <select
                    value={selectedCustId}
                    onChange={(e) => { setSelectedCustId(e.target.value); setSelectedVehId(''); }}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                    required
                  >
                    <option value="">Selecione o Cliente</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Moto do Cliente</label>
                  <select
                    value={selectedVehId}
                    onChange={(e) => setSelectedVehId(e.target.value)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                    disabled={!selectedCustId}
                    required
                  >
                    <option value="">
                      {!selectedCustId ? 'Selecione o cliente primeiro' : 'Selecione a Moto'}
                    </option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plate})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Tipo de Serviço</label>
                  <Input
                    placeholder="Ex: Revisão Geral ou Troca de Relação"
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Mecânico Alocado</label>
                  <select
                    value={selectedMechId}
                    onChange={(e) => setSelectedMechId(e.target.value)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                  >
                    <option value="">Nenhum Alocado (Deixar pendente)</option>
                    {mechanics.map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Preço Estimado (R$)</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={totalPrice}
                    onChange={(e) => setTotalPrice(e.target.value)}
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Descrição do Problema</label>
                  <textarea
                    rows={3}
                    placeholder="Sintomas relatados pelo proprietário..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Observações Internas</label>
                  <textarea
                    rows={2}
                    placeholder="Ferramentas especiais, peças a requerer do estoque..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                  />
                </div>
                <div className="space-y-3 md:col-span-2 border-t border-brand-grey/10 pt-4">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-brand-red" /> Checklist de Entrada
                  </h4>
                  <div className="space-y-2">
                    {checklistItems.map((item, index) => (
                      <div key={item.label} className="grid grid-cols-1 md:grid-cols-[1fr_150px_1.3fr] gap-2 items-center bg-brand-input/50 border border-brand-grey/10 rounded p-2">
                        <span className="text-xs font-mono text-white">{item.label}</span>
                        <select
                          value={item.status}
                          onChange={(e) => updateChecklistItem(setChecklistItems, index, 'status', e.target.value)}
                          className="w-full text-[10px] font-mono bg-brand-black border border-brand-grey/25 text-white rounded px-2 py-2 focus:outline-none focus:border-brand-red"
                        >
                          <option value="OK">OK</option>
                          <option value="ATTENTION">ATENCAO</option>
                          <option value="DAMAGED">AVARIADO</option>
                          <option value="NOT_APPLICABLE">NAO APLICA</option>
                        </select>
                        <Input
                          placeholder="Observacao"
                          value={item.notes}
                          onChange={(e) => updateChecklistItem(setChecklistItems, index, 'notes', e.target.value)}
                          className="text-[10px]"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 md:col-span-2 border-t border-brand-grey/10 pt-4">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <Camera className="w-4 h-4 text-brand-red" /> Fotos da Motocicleta
                  </h4>
                  <Input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setPhotoFiles(Array.from(e.target.files || []))}
                    className="text-xs font-mono bg-brand-input"
                  />
                  {photoFiles.length > 0 && (
                    <div className="text-[10px] font-mono text-brand-grey">
                      {photoFiles.length} foto(s) selecionada(s) para registro de entrada.
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-6 border-t border-brand-grey/10">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancelarCadastro}
                >
                  CANCELAR CADASTRO
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSaving}
                >
                  {isSaving ? 'Salvando...' : 'CONFIRMAR CADASTRO'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* CREATE SUCCESS OVERLAY */}
      {showSuccessOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-brand-card border border-emerald-500/35 p-8 rounded shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-500">
              <ClipboardList className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black tracking-wider uppercase text-emerald-500 leading-tight">
              ORDEM DE SERVIÇO CADASTRADA COM SUCESSO!
            </h3>
            <p className="text-[11px] text-brand-grey leading-normal">
              A ordem de serviço foi registrada com o status PENDENTE no sistema.
            </p>
          </div>
        </div>
      )}

      {/* DETAILS & ACTIONS MODAL */}
      {isDetailModalOpen && selectedSO && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-2xl mx-4 relative p-6 space-y-6 max-h-[90vh] overflow-y-auto" withStripe>
            <button
              onClick={() => {
                setIsDetailModalOpen(false);
                setSelectedSO(null);
              }}
              className="absolute top-4 right-4 text-brand-grey hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header info */}
            <div className="flex justify-between items-start gap-4">
              <div>
                <h3 className="text-lg font-black italic uppercase tracking-tight text-white flex items-center gap-2">
                  OS #{selectedSO.id.slice(0, 8).toUpperCase()}
                </h3>
                <p className="text-[10px] text-brand-grey font-mono uppercase tracking-widest mt-1">
                  Gerencie o status e atualize o checklist de manutenção
                </p>
              </div>
              <div className="text-right">
                {selectedSO.status === 'PENDING' && (
                  <Badge variant="neutral" className="bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 font-mono">PENDENTE</Badge>
                )}
                {selectedSO.status === 'IN_PROGRESS' && (
                  <Badge variant="neutral" className="bg-sky-500/15 text-sky-400 border border-sky-500/25 font-mono">EM ANDAMENTO</Badge>
                )}
                {selectedSO.status === 'COMPLETED' && (
                  <Badge variant="success" className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">SERVIÇO REALIZADO</Badge>
                )}
                {selectedSO.status === 'CANCELLED' && (
                  <Badge variant="danger" className="bg-red-500/15 text-red-400 border border-red-500/25 font-mono">CANCELADO</Badge>
                )}
              </div>
            </div>

            {/* QUICK STATUS TRANSITIONS */}
            <div className="bg-brand-black p-4 border border-brand-grey/10 rounded space-y-3">
              <h4 className="text-[10px] font-mono font-bold uppercase text-brand-grey tracking-wider">
                Ações Rápidas de Status:
              </h4>
              <div className="flex flex-wrap gap-2">
                {selectedSO.status === 'PENDING' && (
                  <Button
                    onClick={() => updateStatus('IN_PROGRESS')}
                    size="sm"
                    className="bg-sky-600 hover:bg-sky-500 text-white font-mono text-[10px] flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" /> INICIAR SERVIÇO
                  </Button>
                )}
                {selectedSO.status === 'IN_PROGRESS' && (
                  <Button
                    onClick={() => updateStatus('COMPLETED')}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] flex items-center gap-1.5"
                  >
                    <CheckSquare className="w-3.5 h-3.5" /> FINALIZAR E CONCLUIR
                  </Button>
                )}
                {selectedSO.status !== 'COMPLETED' && selectedSO.status !== 'CANCELLED' && (
                  <Button
                    onClick={() => updateStatus('CANCELLED')}
                    variant="secondary"
                    size="sm"
                    className="text-red-400 hover:text-red-300 font-mono text-[10px] flex items-center gap-1.5"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> CANCELAR OS
                  </Button>
                )}
                {(selectedSO.status === 'COMPLETED' || selectedSO.status === 'CANCELLED') && (
                  <Button
                    onClick={() => updateStatus('PENDING')}
                    variant="secondary"
                    size="sm"
                    className="text-yellow-400 hover:text-yellow-300 font-mono text-[10px] flex items-center gap-1.5"
                  >
                    REABRIR CHAMADO
                  </Button>
                )}
              </div>
            </div>

            {/* EDITABLE FORM */}
            <form onSubmit={handleUpdateSO} className="space-y-4 text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Cliente (Fixo)</label>
                  <Input value={selectedSO.customer?.full_name || ''} disabled className="opacity-60" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Veículo / Placa (Fixo)</label>
                  <Input value={selectedSO.vehicle ? `${selectedSO.vehicle.brand} ${selectedSO.vehicle.model} (${selectedSO.vehicle.plate})` : ''} disabled className="opacity-60" />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Tipo de Serviço</label>
                  <Input
                    value={eServiceType}
                    onChange={(e) => setEServiceType(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Mecânico Alocado</label>
                  <select
                    value={eMechId}
                    onChange={(e) => setEMechId(e.target.value)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                  >
                    <option value="">Nenhum Alocado</option>
                    {mechanics.map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Preço Estimado / Final (R$)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={eTotalPrice}
                    onChange={(e) => setETotalPrice(e.target.value)}
                  />
                </div>

                <div className="space-y-3 md:col-span-2 border border-brand-grey/15 bg-brand-black/40 p-3">
                  <div className="flex items-center justify-between border-b border-brand-grey/10 pb-2">
                    <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-white flex items-center gap-2">
                      <Plus className="w-4 h-4 text-brand-red" /> Produto da Ordem de Servico
                    </h4>
                    <span className="text-[10px] font-mono text-brand-grey">
                      Total em produtos: R$ {serviceOrderProducts.reduce((sum, item) => sum + item.total_price, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[1fr_100px_150px] gap-2">
                    <select
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                    >
                      <option value="">Selecione um produto</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} - R$ {product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </option>
                      ))}
                    </select>
                    <Input
                      inputMode="decimal"
                      value={selectedProductQuantity}
                      onChange={(e) => setSelectedProductQuantity(e.target.value)}
                      placeholder="Qtd"
                      className="text-xs font-mono"
                    />
                    <Button type="button" variant="secondary" onClick={handleAddServiceOrderProduct}>
                      <Plus className="w-3.5 h-3.5" /> Adicionar
                    </Button>
                  </div>

                  {serviceOrderProducts.length > 0 && (
                    <div className="space-y-2">
                      {serviceOrderProducts.map((item, index) => (
                        <div key={`${item.product_id}-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_80px_110px_40px] gap-2 items-center bg-brand-input/50 border border-brand-grey/10 rounded p-2">
                          <div>
                            <p className="text-xs font-bold text-white">{item.product_name}</p>
                            <p className="text-[10px] font-mono text-brand-grey">{item.product_sku || 'Sem SKU'}</p>
                          </div>
                          <span className="text-xs font-mono text-brand-silver">Qtd {item.quantity}</span>
                          <span className="text-xs font-mono text-white text-right">R$ {item.total_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveServiceOrderProduct(index)}
                            className="h-9 border border-brand-grey/25 text-brand-grey hover:text-brand-red"
                            aria-label="Remover produto"
                          >
                            <Trash2 className="w-4 h-4 mx-auto" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Descrição do Problema</label>
                  <textarea
                    rows={3}
                    value={eDescription}
                    onChange={(e) => setEDescription(e.target.value)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Observações Internas</label>
                  <textarea
                    rows={2}
                    value={eNotes}
                    onChange={(e) => setENotes(e.target.value)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                  />
                </div>
                <div className="space-y-3 md:col-span-2 border-t border-brand-grey/10 pt-4">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-brand-red" /> Checklist de Entrada
                  </h4>
                  <div className="space-y-2">
                    {eChecklistItems.map((item, index) => (
                      <div key={`${item.label}-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_150px_1.3fr] gap-2 items-center bg-brand-input/50 border border-brand-grey/10 rounded p-2">
                        <span className="text-xs font-mono text-white">{item.label}</span>
                        <select
                          value={item.status}
                          onChange={(e) => updateChecklistItem(setEChecklistItems, index, 'status', e.target.value)}
                          className="w-full text-[10px] font-mono bg-brand-black border border-brand-grey/25 text-white rounded px-2 py-2 focus:outline-none focus:border-brand-red"
                        >
                          <option value="OK">OK</option>
                          <option value="ATTENTION">ATENCAO</option>
                          <option value="DAMAGED">AVARIADO</option>
                          <option value="NOT_APPLICABLE">NAO APLICA</option>
                        </select>
                        <Input
                          placeholder="Observacao"
                          value={item.notes}
                          onChange={(e) => updateChecklistItem(setEChecklistItems, index, 'notes', e.target.value)}
                          className="text-[10px]"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 md:col-span-2 border-t border-brand-grey/10 pt-4">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-brand-red" /> Fotos Registradas
                  </h4>
                  {serviceOrderPhotos.length === 0 ? (
                    <div className="py-4 text-center text-brand-grey font-mono text-xs border border-brand-grey/10 rounded bg-brand-input/20">
                      Nenhuma foto registrada para esta ordem.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {serviceOrderPhotos.map((photo) => (
                        <div key={photo.id} className="relative border border-brand-grey/15 rounded overflow-hidden bg-brand-input">
                          <img src={photo.image_url} alt={photo.caption || 'Foto da motocicleta'} className="w-full h-28 object-cover" />
                          <button
                            type="button"
                            onClick={() => handleDeletePhoto(photo)}
                            className="absolute top-2 right-2 p-1.5 bg-black/70 border border-brand-grey/20 text-brand-grey hover:text-brand-red transition-colors"
                            aria-label="Excluir foto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setNewPhotoFiles(Array.from(e.target.files || []))}
                    className="text-xs font-mono bg-brand-input"
                  />
                  {newPhotoFiles.length > 0 && (
                    <div className="text-[10px] font-mono text-brand-grey">
                      {newPhotoFiles.length} nova(s) foto(s) serao adicionada(s) ao salvar.
                    </div>
                  )}
                </div>
              </div>

              {/* Footer buttons */}
              <div className="flex justify-end gap-3 pt-6 border-t border-brand-grey/10">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    setSelectedSO(null);
                  }}
                >
                  CANCELAR
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                >
                  SALVAR ALTERAÇÕES
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* EDIT SUCCESS OVERLAY */}
      {showEditSuccessOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-brand-card border border-emerald-500/35 p-8 rounded shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-500">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black tracking-wider uppercase text-emerald-500 leading-tight">
              ORDEM DE SERVIÇO ATUALIZADA COM SUCESSO!
            </h3>
            <p className="text-[11px] text-brand-grey leading-normal">
              As modificações do chamado da oficina foram gravadas no banco de dados.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
