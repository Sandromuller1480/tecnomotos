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
import { createCustomerAction, deleteCustomerAction, updateCustomerAction } from './actions';
import {
  User,
  Plus,
  Search,
  X,
  Check,
  Phone,
  Mail,
  FileText,
  MapPin,
  Bike,
  Calendar,
  Trash2,
  Edit,
  UserCheck
} from 'lucide-react';

interface ProfileCustomer {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url?: string;
  status: string;
  customers: {
    document: string | null;
    birth_date: string | null;
  } | null;
}

interface Address {
  id: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  postal_code: string;
  is_default: boolean;
}

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  plate: string;
  color?: string;
  vin?: string;
  mileage: number;
}

export default function AdminCustomersPage() {
  const router = useRouter();
  const supabase = createClient();
  const { success, error, info } = useToast();

  const [customers, setCustomers] = useState<ProfileCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Creation Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cDocument, setCDocument] = useState('');
  const [cBirthDate, setCBirthDate] = useState('');
  const [cStreet, setCStreet] = useState('');
  const [cNumber, setCNumber] = useState('');
  const [cComplement, setCComplement] = useState('');
  const [cNeighborhood, setCNeighborhood] = useState('');
  const [cCity, setCCity] = useState('');
  const [cState, setCState] = useState('');
  const [cPostalCode, setCPostalCode] = useState('');
  const [isLookingUpCreateCep, setIsLookingUpCreateCep] = useState(false);

  // Details/Edit Modal States
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<ProfileCustomer | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'addresses' | 'vehicles'>('info');
  const [detailSaving, setDetailSaving] = useState(false);
  const [showEditSuccessOverlay, setShowEditSuccessOverlay] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<ProfileCustomer | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [showDeleteSuccessOverlay, setShowDeleteSuccessOverlay] = useState(false);

  // Edit Customer Profile states
  const [eName, setEName] = useState('');
  const [eEmail, setEEmail] = useState('');
  const [ePhone, setEPhone] = useState('');
  const [eDocument, setEDocument] = useState('');
  const [eBirthDate, setEBirthDate] = useState('');
  const [eStatus, setEStatus] = useState('ACTIVE');

  // Address sub-states
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isAddressFormOpen, setIsAddressFormOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addrStreet, setAddrStreet] = useState('');
  const [addrNumber, setAddrNumber] = useState('');
  const [addrComplement, setAddrComplement] = useState('');
  const [addrNeighborhood, setAddrNeighborhood] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrState, setAddrState] = useState('');
  const [addrPostalCode, setAddrPostalCode] = useState('');
  const [addrIsDefault, setAddrIsDefault] = useState(false);
  const [isLookingUpCep, setIsLookingUpCep] = useState(false);

  // Vehicle sub-states
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isVehicleFormOpen, setIsVehicleFormOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [deleteVehicleSaving, setDeleteVehicleSaving] = useState(false);
  const [showVehicleDeleteSuccessOverlay, setShowVehicleDeleteSuccessOverlay] = useState(false);
  const [vehBrand, setVehBrand] = useState('');
  const [vehModel, setVehModel] = useState('');
  const [vehYear, setVehYear] = useState('');
  const [vehPlate, setVehPlate] = useState('');
  const [vehColor, setVehColor] = useState('');
  const [vehVin, setVehVin] = useState('');
  const [vehMileage, setVehMileage] = useState('');

  const fetchCustomers = async () => {
    try {
      const { data, error: fetchErr } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          email,
          phone,
          avatar_url,
          status,
          customers!inner (
            document,
            birth_date
          )
        `)
        .order('full_name');

      if (fetchErr) throw fetchErr;

      const formatted = (data || []).map((item: any) => ({
        id: item.id,
        full_name: item.full_name,
        email: item.email,
        phone: item.phone,
        avatar_url: item.avatar_url,
        status: item.status,
        customers: Array.isArray(item.customers) ? item.customers[0] : item.customers
      }));

      setCustomers(formatted);
    } catch (e: unknown) {
      console.warn('[Customers] Query failed: ', e);
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

      const { data: hasView } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'customers.view'
      });

      if (!hasView) {
        router.push('/403');
        return;
      }

      const { data: hasCreate } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'customers.create'
      });

      setIsOwner(!!hasCreate);
      await fetchCustomers();
    }

    checkAuthAndLoad();
  }, []);

  const resetCreateForm = () => {
    setCName('');
    setCEmail('');
    setCPhone('');
    setCDocument('');
    setCBirthDate('');
    setCStreet('');
    setCNumber('');
    setCComplement('');
    setCNeighborhood('');
    setCCity('');
    setCState('');
    setCPostalCode('');
  };

  const handleCreateCepChange = async (value: string) => {
    const cep = value.replace(/\D/g, '').slice(0, 8);
    setCPostalCode(cep);
    if (cep.length !== 8) return;

    setIsLookingUpCreateCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) throw new Error('Não foi possível consultar o CEP.');

      const address = await response.json() as { localidade?: string; uf?: string; erro?: boolean };
      if (address.erro || !address.localidade || !address.uf) {
        throw new Error('CEP não encontrado.');
      }

      setCCity(address.localidade);
      setCState(address.uf);
    } catch (err) {
      error('Erro ao consultar CEP', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setIsLookingUpCreateCep(false);
    }
  };

  const handleConfirmCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    setCreateSaving(true);
    const res = await createCustomerAction({
      fullName: cName,
      email: cEmail,
      phone: cPhone,
      document: cDocument,
      birthDate: cBirthDate,
      street: cStreet,
      number: cNumber,
      complement: cComplement,
      neighborhood: cNeighborhood,
      city: cCity,
      state: cState,
      postalCode: cPostalCode,
    });

    setCreateSaving(false);
    if (!res.success) {
      error('Erro ao cadastrar', res.error || 'Erro desconhecido');
    } else {
      resetCreateForm();
      setShowSuccessOverlay(true);
      setTimeout(() => {
        setShowSuccessOverlay(false);
      }, 2500);
      await fetchCustomers();
    }
  };

  const handleCancelarCadastro = () => {
    if (cName || cEmail || cPhone || cDocument || cStreet) {
      resetCreateForm();
      info('Campos Limpos', 'O formulário foi resetado.');
    }
  };

  // Open Details Modal and load sub-resources (addresses and vehicles)
  const handleOpenDetails = async (cust: ProfileCustomer) => {
    setSelectedCustomer(cust);
    setEName(cust.full_name);
    setEEmail(cust.email || '');
    setEPhone(cust.phone || '');
    setEDocument(cust.customers?.document || '');
    setEBirthDate(cust.customers?.birth_date || '');
    setEStatus(cust.status);
    setActiveTab('info');
    setIsDetailModalOpen(true);

    // Fetch addresses
    const { data: addrs } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', cust.id)
      .order('is_default', { ascending: false });
    setAddresses(addrs || []);
    const primaryAddress = addrs?.[0];
    setEditingAddressId(primaryAddress?.id || null);
    setAddrStreet(primaryAddress?.street || '');
    setAddrNumber(primaryAddress?.number || '');
    setAddrComplement(primaryAddress?.complement || '');
    setAddrNeighborhood(primaryAddress?.neighborhood || '');
    setAddrCity(primaryAddress?.city || '');
    setAddrState(primaryAddress?.state || '');
    setAddrPostalCode(primaryAddress?.postal_code || '');
    setAddrIsDefault(primaryAddress?.is_default || false);

    // Fetch vehicles
    const { data: vehs } = await supabase
      .from('customer_vehicles')
      .select('*')
      .eq('customer_id', cust.id)
      .order('brand', { ascending: true });
    setVehicles(vehs || []);
  };

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    setDetailSaving(true);
    try {
      const result = await updateCustomerAction({
        customerId: selectedCustomer.id,
        fullName: eName,
        email: eEmail,
        phone: ePhone,
        document: eDocument,
        birthDate: eBirthDate,
        status: eStatus
      });
      if (!result.success) throw new Error(result.error);

      const hasAddressData = addrStreet || addrNumber || addrComplement || addrNeighborhood || addrCity || addrState || addrPostalCode;

      if (hasAddressData) {
        const addressPayload = {
          customer_id: selectedCustomer.id,
          street: addrStreet,
          number: addrNumber,
          complement: addrComplement,
          neighborhood: addrNeighborhood,
          city: addrCity,
          state: addrState.toUpperCase(),
          postal_code: addrPostalCode,
          is_default: true
        };

        if (editingAddressId) {
          const { error: addrErr } = await supabase
            .from('customer_addresses')
            .update(addressPayload)
            .eq('id', editingAddressId);

          if (addrErr) throw addrErr;
        } else {
          const { error: addrErr } = await supabase
            .from('customer_addresses')
            .insert(addressPayload);

          if (addrErr) throw addrErr;
        }
      }

      setShowEditSuccessOverlay(true);
      setTimeout(() => {
        setShowEditSuccessOverlay(false);
        setIsDetailModalOpen(false);
        resetAddressForm();
      }, 2500);

      await fetchCustomers();
    } catch (err: any) {
      error('Erro de Salvamento', err.message || 'Falha ao atualizar dados do cliente.');
    } finally {
      setDetailSaving(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;

    const deletingCustomer = customerToDelete;
    setCustomerToDelete(null);
    setDeleteSaving(true);
    const res = await deleteCustomerAction(deletingCustomer.id);
    setDeleteSaving(false);
    if (!res.success) {
      error('Erro ao excluir', res.error || 'Falha ao excluir cadastro do cliente.');
      return;
    }

    setCustomers((current) => current.filter((customer) => customer.id !== deletingCustomer.id));
    setShowDeleteSuccessOverlay(true);
    setTimeout(() => {
      setShowDeleteSuccessOverlay(false);
    }, 2500);
    await fetchCustomers();
  };

  // Manage Addresses Actions
  const resetAddressForm = () => {
    setAddrStreet('');
    setAddrNumber('');
    setAddrComplement('');
    setAddrNeighborhood('');
    setAddrCity('');
    setAddrState('');
    setAddrPostalCode('');
    setAddrIsDefault(false);
    setEditingAddressId(null);
    setIsAddressFormOpen(false);
  };

  const handleAddressCepChange = async (value: string) => {
    const cep = value.replace(/\D/g, '').slice(0, 8);
    setAddrPostalCode(cep);
    if (cep.length !== 8) return;

    setIsLookingUpCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) throw new Error('Não foi possível consultar o CEP.');

      const address = await response.json() as { localidade?: string; uf?: string; erro?: boolean };
      if (address.erro || !address.localidade || !address.uf) {
        throw new Error('CEP não encontrado.');
      }

      setAddrCity(address.localidade);
      setAddrState(address.uf);
    } catch (err) {
      error('Erro ao consultar CEP', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setIsLookingUpCep(false);
    }
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    try {
      const payload = {
        customer_id: selectedCustomer.id,
        street: addrStreet,
        number: addrNumber,
        complement: addrComplement,
        neighborhood: addrNeighborhood,
        city: addrCity,
        state: addrState.toUpperCase(),
        postal_code: addrPostalCode,
        is_default: addrIsDefault
      };

      // If is_default is true, set others to false first
      if (addrIsDefault) {
        await supabase
          .from('customer_addresses')
          .update({ is_default: false })
          .eq('customer_id', selectedCustomer.id);
      }

      if (editingAddressId) {
        const { error: err } = await supabase
          .from('customer_addresses')
          .update(payload)
          .eq('id', editingAddressId);
        if (err) throw err;
        success('Endereço Atualizado', 'Endereço salvo com sucesso.');
      } else {
        const { error: err } = await supabase
          .from('customer_addresses')
          .insert(payload);
        if (err) throw err;
        success('Endereço Adicionado', 'Novo endereço adicionado.');
      }

      resetAddressForm();
      // Reload addresses
      const { data: addrs } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', selectedCustomer.id)
        .order('is_default', { ascending: false });
      setAddresses(addrs || []);
    } catch (err: any) {
      error('Erro de Endereço', err.message);
    }
  };

  const handleEditAddress = (addr: Address) => {
    setEditingAddressId(addr.id);
    setAddrStreet(addr.street);
    setAddrNumber(addr.number);
    setAddrComplement(addr.complement || '');
    setAddrNeighborhood(addr.neighborhood);
    setAddrCity(addr.city);
    setAddrState(addr.state);
    setAddrPostalCode(addr.postal_code);
    setAddrIsDefault(addr.is_default);
    setIsAddressFormOpen(true);
  };

  const handleDeleteAddress = async (id: string) => {
    if (!selectedCustomer) return;
    if (!confirm('Deseja excluir este endereço?')) return;

    try {
      const { error: err } = await supabase
        .from('customer_addresses')
        .delete()
        .eq('id', id);
      if (err) throw err;

      success('Endereço Excluído', 'Endereço removido.');
      // Reload
      const { data: addrs } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', selectedCustomer.id)
        .order('is_default', { ascending: false });
      setAddresses(addrs || []);
    } catch (err: any) {
      error('Erro ao Excluir', err.message);
    }
  };

  // Manage Vehicles Actions
  const resetVehicleForm = () => {
    setVehBrand('');
    setVehModel('');
    setVehYear('');
    setVehPlate('');
    setVehColor('');
    setVehVin('');
    setVehMileage('');
    setEditingVehicleId(null);
    setIsVehicleFormOpen(false);
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    try {
      const payload = {
        customer_id: selectedCustomer.id,
        brand: vehBrand,
        model: vehModel,
        year: parseInt(vehYear) || 2026,
        plate: vehPlate.toUpperCase(),
        color: vehColor || null,
        vin: vehVin || null,
        mileage: parseInt(vehMileage) || 0
      };

      if (editingVehicleId) {
        const { error: err } = await supabase
          .from('customer_vehicles')
          .update(payload)
          .eq('id', editingVehicleId);
        if (err) throw err;
        success('Moto Atualizada', 'As especificações da moto foram salvas.');
      } else {
        const { error: err } = await supabase
          .from('customer_vehicles')
          .insert(payload);
        if (err) throw err;
        success('Moto Adicionada', 'A nova moto foi vinculada ao cliente.');
      }

      resetVehicleForm();
      // Reload vehicles
      const { data: vehs } = await supabase
        .from('customer_vehicles')
        .select('*')
        .eq('customer_id', selectedCustomer.id)
        .order('brand', { ascending: true });
      setVehicles(vehs || []);
    } catch (err: any) {
      error('Erro de Veículo', err.message);
    }
  };

  const handleEditVehicle = (veh: Vehicle) => {
    setEditingVehicleId(veh.id);
    setVehBrand(veh.brand);
    setVehModel(veh.model);
    setVehYear(veh.year.toString());
    setVehPlate(veh.plate);
    setVehColor(veh.color || '');
    setVehVin(veh.vin || '');
    setVehMileage(veh.mileage.toString());
    setIsVehicleFormOpen(true);
  };

  const handleDeleteVehicle = async () => {
    if (!selectedCustomer) return;
    if (!vehicleToDelete) return;

    const deletingVehicle = vehicleToDelete;
    setVehicleToDelete(null);
    setDeleteVehicleSaving(true);

    try {
      const { error: err } = await supabase
        .from('customer_vehicles')
        .delete()
        .eq('id', deletingVehicle.id);
      if (err) throw err;

      setVehicles((current) => current.filter((vehicle) => vehicle.id !== deletingVehicle.id));
      setShowVehicleDeleteSuccessOverlay(true);
      setTimeout(() => {
        setShowVehicleDeleteSuccessOverlay(false);
      }, 2500);
      // Reload
      const { data: vehs } = await supabase
        .from('customer_vehicles')
        .select('*')
        .eq('customer_id', selectedCustomer.id)
        .order('brand', { ascending: true });
      setVehicles(vehs || []);
    } catch (err: any) {
      error('Erro ao Excluir', err.message);
    } finally {
      setDeleteVehicleSaving(false);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      c.full_name.toLowerCase().includes(query) ||
      (c.email || '').toLowerCase().includes(query) ||
      (c.phone && c.phone.includes(query)) ||
      (c.customers?.document && c.customers.document.includes(query))
    );
  });

  return (
    <div className="space-y-6 text-left">
      <div>
        <Breadcrumb items={[{ label: 'Clientes' }, { label: 'Lista' }]} />
        <div className="flex justify-between items-center mt-2 border-b border-brand-grey/15 pb-4">
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
              Lista de Clientes
            </h1>
            <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
              Visualize perfis de compradores, endereços e motocicletas associadas
            </p>
          </div>
          {isOwner && (
            <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Novo Cliente
            </Button>
          )}
        </div>
      </div>

      <Card>
        {/* Search Field */}
        <div className="relative w-full max-w-sm mb-6">
          <Input
            placeholder="Pesquisar por nome, email, fone ou documento..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs font-mono bg-brand-input"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey/60 pointer-events-none z-10" />
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-12 text-center text-brand-grey font-mono text-xs">
            Nenhum cliente correspondente encontrado.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.map((c, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-bold text-white flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand-red/10 border border-brand-red/20 flex items-center justify-center text-brand-red text-xs font-black uppercase">
                      {c.full_name.charAt(0)}
                    </div>
                    {c.full_name}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.email || '-'}</TableCell>
                  <TableCell className="font-mono text-xs">{c.phone || '-'}</TableCell>
                  <TableCell className="font-mono text-xs">{c.customers?.document || '-'}</TableCell>
                  <TableCell>
                    {c.status === 'ACTIVE' ? (
                      <Badge variant="success" className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">ATIVO</Badge>
                    ) : (
                      <Badge variant="danger" className="text-[9px]">{c.status === 'INACTIVE' ? 'INATIVO' : c.status === 'BLOCKED' ? 'BLOQUEADO' : c.status}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => handleOpenDetails(c)}>
                        Ver Perfil
                      </Button>
                      <button
                        type="button"
                        onClick={() => handleOpenDetails(c)}
                        className="p-2 text-brand-grey hover:text-white transition-colors"
                        title="Editar cliente"
                        aria-label={`Editar cliente ${c.full_name}`}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => setCustomerToDelete(c)}
                          className="p-2 text-brand-grey hover:text-brand-red transition-colors"
                          title="Excluir cliente"
                          aria-label={`Excluir cliente ${c.full_name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* DELETE CONFIRMATION MODAL */}
      {customerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-md mx-4 relative p-6 space-y-6 text-center" withStripe>
            <div className="mx-auto w-12 h-12 bg-brand-red/10 border border-brand-red/30 rounded-full flex items-center justify-center text-brand-red">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black uppercase tracking-wider text-white leading-tight">
              TEM CERTEZA QUE DESEJA EXCLUIR ESTE CLIENTE?
            </h3>
            <div className="flex justify-center gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCustomerToDelete(null)}
                disabled={deleteSaving}
              >
                CANCELAR
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleDeleteCustomer}
                disabled={deleteSaving}
              >
                {deleteSaving ? 'EXCLUINDO...' : 'EXCLUIR'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* DELETE SUCCESS OVERLAY */}
      {showDeleteSuccessOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-brand-card border border-emerald-500/35 p-8 rounded shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-500">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black tracking-wider uppercase text-emerald-500 leading-tight">
              CLIENTE EXCLU&Iacute;DO COM SUCESSO!
            </h3>
            <p className="text-[11px] text-brand-grey leading-normal">
              O cadastro do cliente foi removido do banco de dados.
            </p>
          </div>
        </div>
      )}

      {/* VEHICLE DELETE CONFIRMATION MODAL */}
      {vehicleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-md mx-4 relative p-6 space-y-6 text-center" withStripe>
            <div className="mx-auto w-12 h-12 bg-brand-red/10 border border-brand-red/30 rounded-full flex items-center justify-center text-brand-red">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black uppercase tracking-wider text-white leading-tight">
              TEM CERTEZA QUE DESEJA EXCLUIR ESTA MOTOCICLETA?
            </h3>
            <div className="flex justify-center gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setVehicleToDelete(null)}
                disabled={deleteVehicleSaving}
              >
                CANCELAR
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleDeleteVehicle}
                disabled={deleteVehicleSaving}
              >
                {deleteVehicleSaving ? 'EXCLUINDO...' : 'EXCLUIR'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* VEHICLE DELETE SUCCESS OVERLAY */}
      {showVehicleDeleteSuccessOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-brand-card border border-emerald-500/35 p-8 rounded shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-500">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black tracking-wider uppercase text-emerald-500 leading-tight">
              MOTOCICLETA EXCLU&Iacute;DA COM SUCESSO!
            </h3>
            <p className="text-[11px] text-brand-grey leading-normal">
              A motocicleta foi removida do banco de dados.
            </p>
          </div>
        </div>
      )}

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
              <h3 className="text-lg font-black italic uppercase tracking-tight text-white">
                Cadastrar Novo Cliente
              </h3>
              <p className="text-[10px] text-brand-grey font-mono uppercase tracking-widest mt-1">
                Cadastro exclusivo do balcão, sem acesso à loja virtual
              </p>
            </div>

            <form onSubmit={handleConfirmCreate} className="space-y-6 text-left">
              {/* Seção 1: Dados Pessoais */}
              <div className="space-y-4">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-brand-red border-b border-brand-grey/10 pb-1">
                  1. Informações Pessoais
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Nome Completo (Opcional)</label>
                    <Input
                      placeholder="Ex: Carlos Silva"
                      value={cName}
                      onChange={(e) => setCName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">E-mail (Opcional)</label>
                    <Input
                      type="email"
                      placeholder="Ex: carlos@email.com"
                      value={cEmail}
                      onChange={(e) => setCEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Telefone / WhatsApp (Opcional)</label>
                    <Input
                      placeholder="Ex: (65) 99999-9999"
                      value={cPhone}
                      onChange={(e) => setCPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">CPF / CNPJ (Opcional)</label>
                    <Input
                      placeholder="Somente números"
                      value={cDocument}
                      onChange={(e) => setCDocument(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Data de Nascimento (Opcional)</label>
                    <Input
                      type="date"
                      value={cBirthDate}
                      onChange={(e) => setCBirthDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Seção 2: Endereço Inicial */}
              <div className="space-y-4">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-brand-red border-b border-brand-grey/10 pb-1">
                  2. Endereço Primário (Opcional)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Logradouro / Rua (Opcional)</label>
                    <Input
                      placeholder="Ex: Av. Brasil"
                      value={cStreet}
                      onChange={(e) => setCStreet(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Número (Opcional)</label>
                    <Input
                      placeholder="Ex: 123"
                      value={cNumber}
                      onChange={(e) => setCNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Complemento (Opcional)</label>
                    <Input
                      placeholder="Ex: Apto 2"
                      value={cComplement}
                      onChange={(e) => setCComplement(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Bairro (Opcional)</label>
                    <Input
                      placeholder="Ex: Centro"
                      value={cNeighborhood}
                      onChange={(e) => setCNeighborhood(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Cidade (Opcional)</label>
                    <Input
                      placeholder="Ex: Tangará da Serra"
                      value={cCity}
                      onChange={(e) => setCCity(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Estado (UF) (Opcional)</label>
                    <Input
                      placeholder="Ex: MT"
                      maxLength={2}
                      value={cState}
                      onChange={(e) => setCState(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">CEP (Opcional) {isLookingUpCreateCep && '(consultando...)'}</label>
                    <Input
                      placeholder="Somente números"
                      value={cPostalCode}
                      onChange={(e) => void handleCreateCepChange(e.target.value)}
                      inputMode="numeric"
                      maxLength={8}
                    />
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
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
                  disabled={createSaving}
                >
                  {createSaving ? 'Salvando...' : 'CONFIRMAR CADASTRO'}
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
              <UserCheck className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black tracking-wider uppercase text-emerald-500 leading-tight">
              CLIENTE CADASTRADO COM SUCESSO!
            </h3>
            <p className="text-[11px] text-brand-grey leading-normal">
              O cliente foi registrado somente para atendimento na loja física.
            </p>
          </div>
        </div>
      )}

      {/* DETAIL & SUB-MANAGER MODAL */}
      {isDetailModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-3xl mx-4 relative p-6 space-y-6 max-h-[90vh] overflow-y-auto" withStripe>
            <button
              onClick={() => {
                setIsDetailModalOpen(false);
                setSelectedCustomer(null);
                resetAddressForm();
                resetVehicleForm();
              }}
              className="absolute top-4 right-4 text-brand-grey hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-lg font-black italic uppercase tracking-tight text-white flex items-center gap-2">
                <User className="w-5 h-5 text-brand-red" />
                Perfil do Cliente: {selectedCustomer.full_name}
              </h3>
              <p className="text-[10px] text-brand-grey font-mono uppercase tracking-widest mt-1">
                Gerencie dados pessoais, endereços e motocicletas associadas
              </p>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-brand-grey/15">
              <button
                onClick={() => { setActiveTab('info'); resetAddressForm(); resetVehicleForm(); }}
                className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border-b-2 transition-all ${activeTab === 'info' ? 'border-brand-red text-white bg-white/5 font-bold' : 'border-transparent text-brand-grey hover:text-white'}`}
              >
                Dados Pessoais
              </button>
              <button
                onClick={() => { setActiveTab('addresses'); resetAddressForm(); resetVehicleForm(); }}
                className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border-b-2 transition-all ${activeTab === 'addresses' ? 'border-brand-red text-white bg-white/5 font-bold' : 'border-transparent text-brand-grey hover:text-white'}`}
              >
                Endereços ({addresses.length})
              </button>
              <button
                onClick={() => { setActiveTab('vehicles'); resetAddressForm(); resetVehicleForm(); }}
                className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border-b-2 transition-all ${activeTab === 'vehicles' ? 'border-brand-red text-white bg-white/5 font-bold' : 'border-transparent text-brand-grey hover:text-white'}`}
              >
                Motocicletas ({vehicles.length})
              </button>
            </div>

            {/* TAB CONTENT: PERSONAL INFO */}
            {activeTab === 'info' && (
              <form onSubmit={handleSaveInfo} className="space-y-4 text-left">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Nome Completo (Opcional no balcão)</label>
                    <Input
                      value={eName}
                      onChange={(e) => setEName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">E-mail (Opcional)</label>
                    <Input
                      type="email"
                      value={eEmail}
                      onChange={(e) => setEEmail(e.target.value)}
                      placeholder="Ex: carlos@email.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Telefone (Opcional)</label>
                    <Input
                      value={ePhone}
                      onChange={(e) => setEPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">CPF / CNPJ (Opcional)</label>
                    <Input
                      value={eDocument}
                      onChange={(e) => setEDocument(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Data de Nascimento (Opcional)</label>
                    <Input
                      type="date"
                      value={eBirthDate}
                      onChange={(e) => setEBirthDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Situação da conta</label>
                    <select
                      value={eStatus}
                      onChange={(e) => setEStatus(e.target.value)}
                      className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                    >
                      <option value="ACTIVE">ATIVO</option>
                      <option value="INACTIVE">INATIVO</option>
                      <option value="BLOCKED">BLOQUEADO</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-brand-red border-b border-brand-grey/10 pb-1">
                    Endereço Primário
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] font-mono text-brand-grey uppercase">Logradouro / Rua</label>
                      <Input
                        placeholder="Ex: Av. Brasil"
                        value={addrStreet}
                        onChange={(e) => setAddrStreet(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-brand-grey uppercase">Número</label>
                      <Input
                        placeholder="Ex: 123"
                        value={addrNumber}
                        onChange={(e) => setAddrNumber(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-brand-grey uppercase">Complemento</label>
                      <Input
                        placeholder="Ex: Apto 2"
                        value={addrComplement}
                        onChange={(e) => setAddrComplement(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-brand-grey uppercase">Bairro</label>
                      <Input
                        placeholder="Ex: Centro"
                        value={addrNeighborhood}
                        onChange={(e) => setAddrNeighborhood(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-brand-grey uppercase">Cidade</label>
                      <Input
                        placeholder="Ex: Tangara da Serra"
                        value={addrCity}
                        onChange={(e) => setAddrCity(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-brand-grey uppercase">Estado (UF)</label>
                      <Input
                        placeholder="Ex: MT"
                        maxLength={2}
                        value={addrState}
                        onChange={(e) => setAddrState(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-brand-grey uppercase">CEP {isLookingUpCep && '(consultando...)'}</label>
                      <Input
                        placeholder="Somente números"
                        value={addrPostalCode}
                        onChange={(e) => void handleAddressCepChange(e.target.value)}
                        inputMode="numeric"
                        maxLength={8}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-brand-grey/10">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      setSelectedCustomer(null);
                    }}
                  >
                    CANCELAR
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={detailSaving}
                  >
                    {detailSaving ? 'Salvando...' : 'CONCLUIR'}
                  </Button>
                </div>
              </form>
            )}

            {/* TAB CONTENT: ADDRESSES */}
            {activeTab === 'addresses' && (
              <div className="space-y-6 text-left">
                {!isAddressFormOpen ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-mono font-bold uppercase text-white">Endereços Cadastrados</h4>
                      <Button size="sm" onClick={() => setIsAddressFormOpen(true)}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Endereço
                      </Button>
                    </div>

                    {addresses.length === 0 ? (
                      <div className="py-8 text-center text-brand-grey font-mono text-xs">
                        Nenhum endereço cadastrado para este cliente.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {addresses.map((addr) => (
                          <div key={addr.id} className="p-3 bg-brand-input border border-brand-grey/15 rounded flex justify-between items-start gap-4">
                            <div className="space-y-1 font-mono text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white">{addr.street}, {addr.number}</span>
                                {addr.is_default && (
                                  <Badge variant="success" className="text-[8px] px-1 py-0 bg-emerald-500/20 text-emerald-400">Padrão</Badge>
                                )}
                              </div>
                              <p className="text-brand-grey text-[11px]">
                                {addr.complement && `${addr.complement} - `}{addr.neighborhood} | {addr.city} - {addr.state} | CEP: {addr.postal_code}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => handleEditAddress(addr)} className="p-1 hover:text-white text-brand-grey transition-colors">
                                <Edit className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteAddress(addr.id)} className="p-1 hover:text-brand-red text-brand-grey transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleSaveAddress} className="space-y-4 border border-brand-grey/15 p-4 rounded bg-brand-input/10">
                    <h4 className="text-xs font-mono font-bold uppercase text-brand-red border-b border-brand-grey/10 pb-1 mb-2">
                      {editingAddressId ? 'Editar Endereço' : 'Adicionar Novo Endereço'}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-mono text-brand-grey uppercase">Rua / Logradouro</label>
                        <Input value={addrStreet} onChange={(e) => setAddrStreet(e.target.value)} required />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-brand-grey uppercase">Número</label>
                        <Input value={addrNumber} onChange={(e) => setAddrNumber(e.target.value)} required />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-brand-grey uppercase">Complemento</label>
                        <Input value={addrComplement} onChange={(e) => setAddrComplement(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-brand-grey uppercase">Bairro</label>
                        <Input value={addrNeighborhood} onChange={(e) => setAddrNeighborhood(e.target.value)} required />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-brand-grey uppercase">Cidade</label>
                        <Input value={addrCity} onChange={(e) => setAddrCity(e.target.value)} required />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-brand-grey uppercase">Estado (UF)</label>
                        <Input value={addrState} onChange={(e) => setAddrState(e.target.value)} required maxLength={2} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-brand-grey uppercase">CEP {isLookingUpCep && '(consultando...)'}</label>
                        <Input value={addrPostalCode} onChange={(e) => void handleAddressCepChange(e.target.value)} required inputMode="numeric" maxLength={8} />
                      </div>
                      <div className="flex items-center gap-2 pt-4">
                        <input
                          type="checkbox"
                          id="addrDefault"
                          checked={addrIsDefault}
                          onChange={(e) => setAddrIsDefault(e.target.checked)}
                          className="w-4 h-4 rounded border-brand-grey/25 bg-brand-input text-brand-red focus:ring-brand-red"
                        />
                        <label htmlFor="addrDefault" className="text-[10px] font-mono text-white cursor-pointer select-none uppercase tracking-wider">
                          Definir como Padrão
                        </label>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t border-brand-grey/10">
                      <Button type="button" variant="secondary" size="sm" onClick={resetAddressForm}>
                        CANCELAR
                      </Button>
                      <Button type="submit" variant="primary" size="sm">
                        SALVAR ENDEREÇO
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* TAB CONTENT: VEHICLES */}
            {activeTab === 'vehicles' && (
              <div className="space-y-6 text-left">
                {!isVehicleFormOpen ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-mono font-bold uppercase text-white">Motocicletas do Cliente</h4>
                      <Button size="sm" onClick={() => setIsVehicleFormOpen(true)}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Moto
                      </Button>
                    </div>

                    {vehicles.length === 0 ? (
                      <div className="py-8 text-center text-brand-grey font-mono text-xs">
                        Nenhuma motocicleta vinculada a este cliente.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {vehicles.map((veh) => (
                          <div key={veh.id} className="p-3 bg-brand-input border border-brand-grey/15 rounded flex justify-between items-start gap-4">
                            <div className="space-y-1 font-mono text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white">{veh.brand} {veh.model} ({veh.year})</span>
                                <Badge variant="neutral" className="text-[8.5px] font-mono px-1.5 py-0.5">{veh.plate}</Badge>
                              </div>
                              <p className="text-brand-grey text-[11px]">
                                Cor: {veh.color || 'Não especificada'} | Chassi (VIN): {veh.vin || 'Não informado'} | Quilometragem: {veh.mileage.toLocaleString()} km
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => handleEditVehicle(veh)} className="p-1 hover:text-white text-brand-grey transition-colors">
                                <Edit className="w-4 h-4" />
                              </button>
                              <button onClick={() => setVehicleToDelete(veh)} className="p-1 hover:text-brand-red text-brand-grey transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleSaveVehicle} className="space-y-4 border border-brand-grey/15 p-4 rounded bg-brand-input/10">
                    <h4 className="text-xs font-mono font-bold uppercase text-brand-red border-b border-brand-grey/10 pb-1 mb-2">
                      {editingVehicleId ? 'Editar Especificações da Moto' : 'Cadastrar Nova Moto'}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-brand-grey uppercase">Marca</label>
                        <Input placeholder="Ex: Honda" value={vehBrand} onChange={(e) => setVehBrand(e.target.value)} required />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-brand-grey uppercase">Modelo</label>
                        <Input placeholder="Ex: CB 500X" value={vehModel} onChange={(e) => setVehModel(e.target.value)} required />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-brand-grey uppercase">Ano</label>
                        <Input type="number" placeholder="Ex: 2022" value={vehYear} onChange={(e) => setVehYear(e.target.value)} required />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-brand-grey uppercase">Placa</label>
                        <Input placeholder="Ex: ABC1D23" value={vehPlate} onChange={(e) => setVehPlate(e.target.value)} required />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-brand-grey uppercase">Cor</label>
                        <Input placeholder="Ex: Vermelha" value={vehColor} onChange={(e) => setVehColor(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-brand-grey uppercase">KM Atual</label>
                        <Input type="number" placeholder="Ex: 12000" value={vehMileage} onChange={(e) => setVehMileage(e.target.value)} required />
                      </div>
                      <div className="space-y-1 md:col-span-3">
                        <label className="text-[10px] font-mono text-brand-grey uppercase">Chassi / VIN (Opcional)</label>
                        <Input placeholder="Ex: 9SBxxxxxxxxxxxxxx" value={vehVin} onChange={(e) => setVehVin(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t border-brand-grey/10">
                      <Button type="button" variant="secondary" size="sm" onClick={resetVehicleForm}>
                        CANCELAR
                      </Button>
                      <Button type="submit" variant="primary" size="sm">
                        SALVAR VEÍCULO
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}
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
              PRODUTO EDITADO COM SUCESSO!
            </h3>
            <p className="text-[11px] text-brand-grey leading-normal">
              As alterações do cadastro do cliente foram gravadas no banco de dados.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
