'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import {
  ShoppingBag,
  MapPin,
  Bike,
  User,
  Check,
  Plus,
  Edit,
  Trash2,
  Lock
} from 'lucide-react';

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

export default function CustomerDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const { success, error } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState<'orders' | 'account' | 'addresses' | 'vehicles'>('orders');

  // Personal Info States
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [document, setDocument] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [stateRegistration, setStateRegistration] = useState('');
  const [taxpayerIndicator, setTaxpayerIndicator] = useState('');
  const [purchasePurpose, setPurchasePurpose] = useState('');
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

  // Address States
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

  // Vehicle States
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isVehicleFormOpen, setIsVehicleFormOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehBrand, setVehBrand] = useState('');
  const [vehModel, setVehModel] = useState('');
  const [vehYear, setVehYear] = useState('');
  const [vehPlate, setVehPlate] = useState('');
  const [vehColor, setVehColor] = useState('');
  const [vehVin, setVehVin] = useState('');
  const [vehMileage, setVehMileage] = useState('');

  const loadCustomerData = async (uid: string) => {
    try {
      // 1. Get profile and customer details
      const { data: profile } = await supabase
        .from('profiles')
        .select(`
          full_name,
          phone,
          customers (
            document,
            birth_date,
            state_registration,
            icms_taxpayer_indicator,
            purchase_purpose
          )
        `)
        .eq('id', uid)
        .single();

      if (profile) {
        setFullName(profile.full_name || '');
        setPhone(profile.phone || '');
        const custData = Array.isArray(profile.customers) ? profile.customers[0] : profile.customers;
        if (custData) {
          setDocument(custData.document || '');
          setBirthDate(custData.birth_date || '');
          setStateRegistration(custData.state_registration || '');
          setTaxpayerIndicator(custData.icms_taxpayer_indicator || '');
          setPurchasePurpose(custData.purchase_purpose || '');
        }
      }

      // 2. Get addresses
      const { data: addrs } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', uid)
        .order('is_default', { ascending: false });
      setAddresses(addrs || []);

      // 3. Get vehicles
      const { data: vehs } = await supabase
        .from('customer_vehicles')
        .select('*')
        .eq('customer_id', uid)
        .order('brand', { ascending: true });
      setVehicles(vehs || []);

    } catch (err) {
      console.warn('[Customer Dashboard] Error loading customer resources:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const role = (user.app_metadata?.role as string) || (user.user_metadata?.role as string) || 'CUSTOMER';
      if (role !== 'CUSTOMER') {
        router.push('/admin/dashboard');
        return;
      }

      const { data: customerAccount, error: customerAccountError } = await supabase
        .from('customers')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (customerAccountError || !customerAccount) {
        error('Cadastro não vinculado', 'Não foi possível localizar o cadastro comercial desta conta.');
        await supabase.auth.signOut();
        router.push('/login');
        return;
      }

      setUserId(customerAccount.id);
      setEmail(user.email || '');
      await loadCustomerData(customerAccount.id);
    }

    checkAuth();
  }, []);

  const handleUpdateInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setIsSavingInfo(true);
    try {
      // Update profile name & phone
      const { error: profErr } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phone
        })
        .eq('id', userId);

      if (profErr) throw profErr;

      // Update customer birth_date & document
      const { error: custErr } = await supabase
        .from('customers')
        .update({
          document: document ? document.replace(/\D/g, '') : null,
          birth_date: birthDate || null,
          state_registration: stateRegistration.trim() || null,
          icms_taxpayer_indicator: taxpayerIndicator || null,
          purchase_purpose: purchasePurpose || null
        })
        .eq('id', userId);

      if (custErr) throw custErr;

      setShowSuccessOverlay(true);
      setTimeout(() => {
        setShowSuccessOverlay(false);
      }, 2500);
    } catch (err: any) {
      error('Falha ao Salvar', err.message || 'Ocorreu um erro.');
    } finally {
      setIsSavingInfo(false);
    }
  };

  // Address Actions
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

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    try {
      const payload = {
        customer_id: userId,
        street: addrStreet,
        number: addrNumber,
        complement: addrComplement,
        neighborhood: addrNeighborhood,
        city: addrCity,
        state: addrState.toUpperCase(),
        postal_code: addrPostalCode,
        is_default: addrIsDefault
      };

      if (addrIsDefault) {
        await supabase
          .from('customer_addresses')
          .update({ is_default: false })
          .eq('customer_id', userId);
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
        success('Endereço Adicionado', 'Novo endereço cadastrado.');
      }

      resetAddressForm();
      await loadCustomerData(userId);
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
    if (!userId) return;
    if (!confirm('Deseja excluir este endereço?')) return;

    try {
      const { error: err } = await supabase
        .from('customer_addresses')
        .delete()
        .eq('id', id);
      if (err) throw err;

      success('Endereço Excluído', 'Endereço removido.');
      await loadCustomerData(userId);
    } catch (err: any) {
      error('Erro ao Excluir', err.message);
    }
  };

  // Vehicle Actions
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
    if (!userId) return;

    try {
      const payload = {
        customer_id: userId,
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
        success('Moto Adicionada', 'A nova moto foi vinculada ao seu perfil.');
      }

      resetVehicleForm();
      await loadCustomerData(userId);
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

  const handleDeleteVehicle = async (id: string) => {
    if (!userId) return;
    if (!confirm('Deseja excluir esta moto do seu perfil?')) return;

    try {
      const { error: err } = await supabase
        .from('customer_vehicles')
        .delete()
        .eq('id', id);
      if (err) throw err;

      success('Moto Excluída', 'Moto removida.');
      await loadCustomerData(userId);
    } catch (err: any) {
      error('Erro ao Excluir', err.message);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-brand-black text-white">
      {/* Customer Header */}
      <Navbar isAuthenticated={true} userRole="CUSTOMER" />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-12 w-1/3" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Skeleton className="h-48 md:col-span-1" />
              <Skeleton className="h-96 md:col-span-3" />
            </div>
          </div>
        ) : (
          <>
            {/* Welcome Block */}
            <div className="border-b border-brand-grey/15 pb-6 text-left">
              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-brand-red font-bold">
                ÁREA DO CLIENTE
              </span>
              <h1 className="text-3xl font-black italic uppercase tracking-tight text-white mt-1">
                Olá, {fullName.split(' ')[0] || 'Cliente'}!
              </h1>
            </div>

            {/* Dashboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Quick Menu Options */}
              <div className="md:col-span-1 space-y-4">
                <Card className="p-4" withStripe>
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-brand-grey border-b border-brand-grey/15 pb-2 mb-3 text-left">
                    Menu de Acesso
                  </h3>
                  <ul className="space-y-1 font-mono text-xs text-left">
                    <li>
                      <button
                        onClick={() => { setActiveMenu('orders'); resetAddressForm(); resetVehicleForm(); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors skew-x-[-6deg] ${activeMenu === 'orders' ? 'text-white bg-white/5 font-bold' : 'text-brand-grey hover:text-white hover:bg-white/2'}`}
                      >
                        <span className="skew-x-[6deg] flex items-center gap-2">
                          <ShoppingBag className="w-4 h-4 text-brand-red" />
                          Meus Pedidos
                        </span>
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => { setActiveMenu('account'); resetAddressForm(); resetVehicleForm(); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors skew-x-[-6deg] ${activeMenu === 'account' ? 'text-white bg-white/5 font-bold' : 'text-brand-grey hover:text-white hover:bg-white/2'}`}
                      >
                        <span className="skew-x-[6deg] flex items-center gap-2">
                          <User className="w-4 h-4 text-brand-red" />
                          Minha Conta
                        </span>
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => { setActiveMenu('addresses'); resetAddressForm(); resetVehicleForm(); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors skew-x-[-6deg] ${activeMenu === 'addresses' ? 'text-white bg-white/5 font-bold' : 'text-brand-grey hover:text-white hover:bg-white/2'}`}
                      >
                        <span className="skew-x-[6deg] flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-brand-red" />
                          Meus Endereços
                        </span>
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => { setActiveMenu('vehicles'); resetAddressForm(); resetVehicleForm(); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors skew-x-[-6deg] ${activeMenu === 'vehicles' ? 'text-white bg-white/5 font-bold' : 'text-brand-grey hover:text-white hover:bg-white/2'}`}
                      >
                        <span className="skew-x-[6deg] flex items-center gap-2">
                          <Bike className="w-4 h-4 text-brand-red" />
                          Minhas Motas
                        </span>
                      </button>
                    </li>
                  </ul>
                </Card>
              </div>

              {/* Detailed Sections */}
              <div className="md:col-span-3 space-y-6 text-left">
                {/* 1. ORDERS TAB */}
                {activeMenu === 'orders' && (
                  <Card className="space-y-4">
                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white border-b border-brand-grey/15 pb-2">
                      Histórico Recente de Pedidos
                    </h3>
                    <EmptyState
                      title="Nenhum pedido realizado"
                      description="Você ainda não possui pedidos em nossa loja online. Peças esportivas e acessórios premium estarão disponíveis em breve!"
                    />
                  </Card>
                )}

                {/* 2. ACCOUNT TAB */}
                {activeMenu === 'account' && (
                  <Card className="space-y-6">
                    <div>
                      <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white border-b border-brand-grey/15 pb-2">
                        Minhas Informações Pessoais
                      </h3>
                      <p className="text-[11px] text-brand-grey font-mono mt-1">
                        Atualize suas informações de contato e faturamento
                      </p>
                    </div>

                    <form onSubmit={handleUpdateInfo} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-brand-grey uppercase">Nome Completo</label>
                          <Input
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-brand-grey uppercase flex items-center gap-1.5">
                            E-mail de Acesso <Lock className="w-3 h-3 text-brand-grey" />
                          </label>
                          <Input
                            value={email}
                            disabled
                            className="opacity-60"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-brand-grey uppercase">Telefone / WhatsApp</label>
                          <Input
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-brand-grey uppercase">CPF / CNPJ (Faturamento)</label>
                          <Input
                            placeholder="Apenas números"
                            value={document}
                            onChange={(e) => setDocument(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-brand-grey uppercase">Data de Nascimento</label>
                          <Input
                            type="date"
                            value={birthDate}
                            onChange={(e) => setBirthDate(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-brand-grey uppercase">Situação perante o ICMS</label>
                          <select value={taxpayerIndicator} onChange={(e) => setTaxpayerIndicator(e.target.value)} className="w-full border border-brand-grey/20 bg-brand-darkgrey px-4 py-2.5 text-sm text-white focus:border-brand-red focus:outline-none">
                            <option value="">Selecione</option><option value="contributor">Contribuinte</option><option value="exempt">Isento</option><option value="non_contributor">Não contribuinte</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-brand-grey uppercase">Inscrição Estadual</label>
                          <Input value={stateRegistration} onChange={(e) => setStateRegistration(e.target.value)} placeholder="Quando aplicável" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-brand-grey uppercase">Finalidade habitual da compra</label>
                          <select value={purchasePurpose} onChange={(e) => setPurchasePurpose(e.target.value)} className="w-full border border-brand-grey/20 bg-brand-darkgrey px-4 py-2.5 text-sm text-white focus:border-brand-red focus:outline-none">
                            <option value="">Selecione</option><option value="final_consumption">Consumo final</option><option value="resale">Revenda</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end pt-4 border-t border-brand-grey/10">
                        <Button
                          type="submit"
                          variant="primary"
                          disabled={isSavingInfo}
                        >
                          {isSavingInfo ? 'Salvando...' : 'CONCLUIR'}
                        </Button>
                      </div>
                    </form>
                  </Card>
                )}

                {/* 3. ADDRESSES TAB */}
                {activeMenu === 'addresses' && (
                  <Card className="space-y-6">
                    <div className="flex justify-between items-center border-b border-brand-grey/15 pb-2">
                      <div>
                        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                          Endereços de Entrega
                        </h3>
                        <p className="text-[11px] text-brand-grey font-mono mt-1">
                          Configure seus endereços principais para cálculo de frete
                        </p>
                      </div>
                      {!isAddressFormOpen && (
                        <Button size="sm" onClick={() => setIsAddressFormOpen(true)}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Endereço
                        </Button>
                      )}
                    </div>

                    {!isAddressFormOpen ? (
                      addresses.length === 0 ? (
                        <EmptyState
                          title="Nenhum endereço cadastrado"
                          description="Cadastre um endereço para permitir o envio de suas compras e cálculo automático de frete."
                          icon={<MapPin className="w-10 h-10 text-brand-grey/40" />}
                        />
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {addresses.map((addr) => (
                            <div key={addr.id} className="p-4 bg-brand-input border border-brand-grey/15 rounded flex justify-between items-start gap-4">
                              <div className="space-y-1.5 font-mono text-xs text-left">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-white">{addr.street}, {addr.number}</span>
                                  {addr.is_default && (
                                    <Badge variant="success" className="text-[8px] px-1 py-0 bg-emerald-500/20 text-emerald-400">Padrão</Badge>
                                  )}
                                </div>
                                <p className="text-brand-grey text-[11px]">
                                  {addr.complement && `${addr.complement} - `}{addr.neighborhood}
                                </p>
                                <p className="text-brand-grey text-[11px]">
                                  {addr.city} - {addr.state} | {addr.postal_code}
                                </p>
                              </div>
                              <div className="flex gap-1.5">
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
                      )
                    ) : (
                      <form onSubmit={handleSaveAddress} className="space-y-4 border border-brand-grey/15 p-4 rounded bg-brand-input/10">
                        <h4 className="text-xs font-mono font-bold uppercase text-brand-red border-b border-brand-grey/10 pb-1 mb-2">
                          {editingAddressId ? 'Editar Endereço' : 'Cadastrar Novo Endereço'}
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
                            <label className="text-[10px] font-mono text-brand-grey uppercase">CEP</label>
                            <Input value={addrPostalCode} onChange={(e) => setAddrPostalCode(e.target.value)} required />
                          </div>
                          <div className="flex items-center gap-2 pt-4">
                            <input
                              type="checkbox"
                              id="cAddrDefault"
                              checked={addrIsDefault}
                              onChange={(e) => setAddrIsDefault(e.target.checked)}
                              className="w-4 h-4 rounded border-brand-grey/25 bg-brand-input text-brand-red focus:ring-brand-red"
                            />
                            <label htmlFor="cAddrDefault" className="text-[10px] font-mono text-white cursor-pointer select-none uppercase tracking-wider">
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
                  </Card>
                )}

                {/* 4. VEHICLES TAB */}
                {activeMenu === 'vehicles' && (
                  <Card className="space-y-6">
                    <div className="flex justify-between items-center border-b border-brand-grey/15 pb-2">
                      <div>
                        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                          Minhas Motocicletas
                        </h3>
                        <p className="text-[11px] text-brand-grey font-mono mt-1">
                          Gerencie as motos que você traz para manutenção
                        </p>
                      </div>
                      {!isVehicleFormOpen && (
                        <Button size="sm" onClick={() => setIsVehicleFormOpen(true)}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Moto
                        </Button>
                      )}
                    </div>

                    {!isVehicleFormOpen ? (
                      vehicles.length === 0 ? (
                        <EmptyState
                          title="Nenhuma moto cadastrada"
                          description="Cadastre suas motos para facilitar o acompanhamento de ordens de serviço e compatibilidade na loja."
                          icon={<Bike className="w-10 h-10 text-brand-grey/40" />}
                        />
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {vehicles.map((veh) => (
                            <div key={veh.id} className="p-4 bg-brand-input border border-brand-grey/15 rounded flex justify-between items-start gap-4">
                              <div className="space-y-1.5 font-mono text-xs text-left">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-white">{veh.brand} {veh.model}</span>
                                  <Badge variant="neutral" className="text-[8px] font-mono px-1 py-0">{veh.plate}</Badge>
                                </div>
                                <p className="text-brand-grey text-[11px]">
                                  Ano: {veh.year} | Cor: {veh.color || '-'}
                                </p>
                                <p className="text-brand-grey text-[11px]">
                                  KM: {veh.mileage.toLocaleString()} km
                                </p>
                              </div>
                              <div className="flex gap-1.5">
                                <button onClick={() => handleEditVehicle(veh)} className="p-1 hover:text-white text-brand-grey transition-colors">
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteVehicle(veh.id)} className="p-1 hover:text-brand-red text-brand-grey transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    ) : (
                      <form onSubmit={handleSaveVehicle} className="space-y-4 border border-brand-grey/15 p-4 rounded bg-brand-input/10">
                        <h4 className="text-xs font-mono font-bold uppercase text-brand-red border-b border-brand-grey/10 pb-1 mb-2">
                          {editingVehicleId ? 'Editar Moto' : 'Cadastrar Nova Moto'}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-mono text-brand-grey uppercase">Marca</label>
                            <Input placeholder="Ex: Honda" value={vehBrand} onChange={(e) => setVehBrand(e.target.value)} required />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-mono text-brand-grey uppercase">Modelo</label>
                            <Input placeholder="Ex: XRE 300" value={vehModel} onChange={(e) => setVehModel(e.target.value)} required />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-mono text-brand-grey uppercase">Ano</label>
                            <Input type="number" placeholder="Ex: 2021" value={vehYear} onChange={(e) => setVehYear(e.target.value)} required />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-mono text-brand-grey uppercase">Placa</label>
                            <Input placeholder="Ex: ABC1D23" value={vehPlate} onChange={(e) => setVehPlate(e.target.value)} required />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-mono text-brand-grey uppercase">Cor</label>
                            <Input placeholder="Ex: Preta" value={vehColor} onChange={(e) => setVehColor(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-mono text-brand-grey uppercase">KM Atual</label>
                            <Input type="number" placeholder="Ex: 8500" value={vehMileage} onChange={(e) => setVehMileage(e.target.value)} required />
                          </div>
                          <div className="space-y-1 md:col-span-3">
                            <label className="text-[10px] font-mono text-brand-grey uppercase">Chassi / VIN (Opcional)</label>
                            <Input placeholder="Chassi da moto" value={vehVin} onChange={(e) => setVehVin(e.target.value)} />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-4 border-t border-brand-grey/10">
                          <Button type="button" variant="secondary" size="sm" onClick={resetVehicleForm}>
                            CANCELAR
                          </Button>
                          <Button type="submit" variant="primary" size="sm">
                            SALVAR MOTO
                          </Button>
                        </div>
                      </form>
                    )}
                  </Card>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* EDIT PERSONAL INFO SUCCESS OVERLAY */}
      {showSuccessOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-brand-card border border-emerald-500/35 p-8 rounded shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-500">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black tracking-wider uppercase text-emerald-500 leading-tight">
              CADASTRO EDITADO COM SUCESSO!
            </h3>
            <p className="text-[11px] text-brand-grey leading-normal">
              Suas alterações de faturamento e dados de contato foram persistidas.
            </p>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
