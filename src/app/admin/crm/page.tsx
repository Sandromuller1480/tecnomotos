'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  Check,
  Clock,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  StickyNote,
  User,
  Users,
  X
} from 'lucide-react';

type InteractionType = 'CALL' | 'WHATSAPP' | 'EMAIL' | 'VISIT' | 'NOTE';
type CrmStatus = 'OPEN' | 'FOLLOW_UP' | 'DONE' | 'CANCELLED';
type CrmPriority = 'LOW' | 'NORMAL' | 'HIGH';

interface CustomerOption {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  document: string | null;
}

interface CrmInteraction {
  id: string;
  customer_id: string;
  interaction_type: InteractionType;
  subject: string;
  description: string | null;
  outcome: string | null;
  priority: CrmPriority;
  status: CrmStatus;
  follow_up_at: string | null;
  created_at: string;
  customer?: {
    full_name: string;
    email: string;
    phone: string | null;
  };
}

const typeLabels: Record<InteractionType, string> = {
  CALL: 'Ligacao',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  VISIT: 'Visita',
  NOTE: 'Nota'
};

const statusLabels: Record<CrmStatus, string> = {
  OPEN: 'Aberto',
  FOLLOW_UP: 'Follow-up',
  DONE: 'Concluído',
  CANCELLED: 'Cancelado'
};

const priorityLabels: Record<CrmPriority, string> = {
  LOW: 'Baixa',
  NORMAL: 'Normal',
  HIGH: 'Alta'
};

function interactionIcon(type: InteractionType) {
  if (type === 'CALL') return <Phone className="w-4 h-4" />;
  if (type === 'WHATSAPP') return <MessageCircle className="w-4 h-4" />;
  if (type === 'EMAIL') return <Mail className="w-4 h-4" />;
  if (type === 'VISIT') return <Users className="w-4 h-4" />;
  return <StickyNote className="w-4 h-4" />;
}

export default function AdminCrmPage() {
  const router = useRouter();
  const supabase = createClient();
  const { success, error, info } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [interactions, setInteractions] = useState<CrmInteraction[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [interactionType, setInteractionType] = useState<InteractionType>('WHATSAPP');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [outcome, setOutcome] = useState('');
  const [priority, setPriority] = useState<CrmPriority>('NORMAL');
  const [status, setStatus] = useState<CrmStatus>('OPEN');
  const [followUpAt, setFollowUpAt] = useState('');

  const fetchCustomers = async () => {
    const { data, error: fetchErr } = await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        email,
        phone,
        customers!inner (
          document
        )
      `)
      .order('full_name');

    if (fetchErr) throw fetchErr;

    const formatted = (data || []).map((item: any) => ({
        id: item.id,
        full_name: item.full_name,
        email: item.email,
        phone: item.phone,
        document: Array.isArray(item.customers) ? item.customers[0]?.document || null : item.customers?.document || null
      }));

    setCustomers(formatted);
  };

  const fetchInteractions = async () => {
    const { data, error: fetchErr } = await supabase
      .from('customer_crm_interactions')
      .select(`
        id,
        customer_id,
        interaction_type,
        subject,
        description,
        outcome,
        priority,
        status,
        follow_up_at,
        created_at,
        customer:customers!customer_crm_interactions_customer_id_fkey (
          id,
          profiles!customers_id_fkey (
            full_name,
            email,
            phone
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (fetchErr) throw fetchErr;

    const formatted = (data || []).map((item: any) => {
      const profile = Array.isArray(item.customer?.profiles) ? item.customer.profiles[0] : item.customer?.profiles;
      return {
        id: item.id,
        customer_id: item.customer_id,
        interaction_type: item.interaction_type,
        subject: item.subject,
        description: item.description,
        outcome: item.outcome,
        priority: item.priority,
        status: item.status,
        follow_up_at: item.follow_up_at,
        created_at: item.created_at,
        customer: {
          full_name: profile?.full_name || 'Cliente',
          email: profile?.email || '',
          phone: profile?.phone || null
        }
      };
    });

    setInteractions(formatted as CrmInteraction[]);
  };

  useEffect(() => {
    async function loadCrm() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: hasView } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'crm.view'
      });

      if (!hasView) {
        router.push('/403');
        return;
      }

      const { data: hasManage } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'customers.update'
      });

      setCanManage(!!hasManage);

      try {
        await Promise.all([fetchCustomers(), fetchInteractions()]);
      } catch (err: any) {
        error('Erro ao carregar CRM', err.message || 'Falha ao buscar dados do CRM.');
      } finally {
        setIsLoading(false);
      }
    }

    loadCrm();
  }, []);

  const resetForm = () => {
    setCustomerId('');
    setInteractionType('WHATSAPP');
    setSubject('');
    setDescription('');
    setOutcome('');
    setPriority('NORMAL');
    setStatus('OPEN');
    setFollowUpAt('');
  };

  const handleCreateInteraction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!customerId || !subject) {
      error('Campos Obrigatorios', 'Cliente e assunto sao necessarios.');
      return;
    }

    setIsSaving(true);
    try {
      const { error: insertErr } = await supabase
        .from('customer_crm_interactions')
        .insert({
          customer_id: customerId,
          interaction_type: interactionType,
          subject,
          description: description || null,
          outcome: outcome || null,
          priority,
          status,
          follow_up_at: followUpAt || null
        });

      if (insertErr) throw insertErr;

      resetForm();
      setIsCreateModalOpen(false);
      setShowSuccessOverlay(true);
      setTimeout(() => setShowSuccessOverlay(false), 2500);
      await fetchInteractions();
    } catch (err: any) {
      error('Erro ao salvar', err.message || 'Falha ao registrar interacao.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateInteractionStatus = async (interaction: CrmInteraction, nextStatus: CrmStatus) => {
    try {
      const { error: updateErr } = await supabase
        .from('customer_crm_interactions')
        .update({ status: nextStatus })
        .eq('id', interaction.id);

      if (updateErr) throw updateErr;

      setInteractions((current) => current.map((item) => (
        item.id === interaction.id ? { ...item, status: nextStatus } : item
      )));
      success('CRM Atualizado', `Atendimento marcado como ${statusLabels[nextStatus]}.`);
    } catch (err: any) {
      error('Erro ao atualizar CRM', err.message);
    }
  };

  const filteredInteractions = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return interactions.filter((item) => {
      const matchesCustomer = selectedCustomerId === 'ALL' || item.customer_id === selectedCustomerId;
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchesSearch = !query || (
        item.subject.toLowerCase().includes(query) ||
        (item.description || '').toLowerCase().includes(query) ||
        (item.customer?.full_name || '').toLowerCase().includes(query) ||
        (item.customer?.email || '').toLowerCase().includes(query) ||
        (item.customer?.phone || '').includes(query)
      );

      return matchesCustomer && matchesStatus && matchesSearch;
    });
  }, [interactions, searchQuery, selectedCustomerId, statusFilter]);

  const openCount = interactions.filter((item) => item.status === 'OPEN').length;
  const followUpCount = interactions.filter((item) => item.status === 'FOLLOW_UP').length;
  const doneCount = interactions.filter((item) => item.status === 'DONE').length;

  return (
    <div className="space-y-6 text-left">
      <div>
        <Breadcrumb items={[{ label: 'Clientes' }, { label: 'CRM' }]} />
        <div className="flex justify-between items-center mt-2 border-b border-brand-grey/15 pb-4">
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
              Atendimento & CRM
            </h1>
            <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
              Gerencie o relacionamento e hist&oacute;ricos de intera&ccedil;&otilde;es com os clientes
            </p>
          </div>
          {canManage ? (
            <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Nova Interacao
            </Button>
          ) : (
            <Badge variant="neutral">Relacionamento</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-brand-grey">Clientes</div>
          <div className="text-2xl font-black text-white mt-1">{customers.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-brand-grey">Abertos</div>
          <div className="text-2xl font-black text-yellow-400 mt-1">{openCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-brand-grey">Follow-ups</div>
          <div className="text-2xl font-black text-sky-400 mt-1">{followUpCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-brand-grey">Concluídos</div>
          <div className="text-2xl font-black text-emerald-400 mt-1">{doneCount}</div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="relative w-full max-w-sm">
            <Input
              placeholder="Buscar por cliente, telefone, email ou assunto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs font-mono bg-brand-input"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey/60 pointer-events-none z-10" />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
            >
              <option value="ALL">Todos os clientes</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.full_name}</option>
              ))}
            </select>

            <div className="flex bg-brand-black p-1 border border-brand-grey/10 rounded font-mono text-[10px] uppercase">
              {[
                { id: 'ALL', label: 'Todos' },
                { id: 'OPEN', label: 'Aberto' },
                { id: 'FOLLOW_UP', label: 'Follow-up' },
                { id: 'DONE', label: 'Concluído' }
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
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : filteredInteractions.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-brand-grey/15">
            <div className="mx-auto w-14 h-14 rounded-full bg-brand-black border border-brand-grey/10 flex items-center justify-center text-brand-grey mb-4">
              <StickyNote className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">
              Nenhuma interacao de CRM registrada
            </h3>
            <p className="text-xs text-brand-grey mt-2">
              Registre atendimentos, retornos e follow-ups para acompanhar o relacionamento com clientes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredInteractions.map((interaction) => (
              <div key={interaction.id} className="border border-brand-grey/15 bg-brand-input/40 p-4 flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-brand-red">{interactionIcon(interaction.interaction_type)}</span>
                    <span className="font-black text-white uppercase">{interaction.subject}</span>
                    <Badge variant="neutral" className="text-[9px]">{typeLabels[interaction.interaction_type]}</Badge>
                    {interaction.priority === 'HIGH' && <Badge variant="danger" className="text-[9px]">Alta</Badge>}
                    {interaction.priority === 'LOW' && <Badge variant="neutral" className="text-[9px]">Baixa</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-mono text-brand-grey">
                    <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" /> {interaction.customer?.full_name}</span>
                    <span>{interaction.customer?.email}</span>
                    <span>{interaction.customer?.phone || '-'}</span>
                    <span>{new Date(interaction.created_at).toLocaleDateString('pt-BR')}</span>
                    {interaction.follow_up_at && (
                      <span className="inline-flex items-center gap-1 text-sky-400">
                        <Clock className="w-3.5 h-3.5" /> {new Date(interaction.follow_up_at).toLocaleString('pt-BR')}
                      </span>
                    )}
                  </div>
                  {interaction.description && (
                    <p className="text-xs text-brand-silver leading-relaxed">{interaction.description}</p>
                  )}
                  {interaction.outcome && (
                    <p className="text-xs text-emerald-400 leading-relaxed">Resultado: {interaction.outcome}</p>
                  )}
                </div>

                <div className="flex flex-wrap xl:flex-col items-end gap-2">
                  {interaction.status === 'OPEN' && <Badge variant="warning">{statusLabels[interaction.status]}</Badge>}
                  {interaction.status === 'FOLLOW_UP' && <Badge variant="info">{statusLabels[interaction.status]}</Badge>}
                  {interaction.status === 'DONE' && <Badge variant="success">{statusLabels[interaction.status]}</Badge>}
                  {interaction.status === 'CANCELLED' && <Badge variant="danger">{statusLabels[interaction.status]}</Badge>}
                  {canManage && interaction.status !== 'DONE' && (
                    <Button size="sm" variant="secondary" onClick={() => updateInteractionStatus(interaction, 'DONE')}>
                      <Check className="w-3.5 h-3.5" /> Concluir
                    </Button>
                  )}
                  {canManage && interaction.status === 'DONE' && (
                    <Button size="sm" variant="secondary" onClick={() => updateInteractionStatus(interaction, 'FOLLOW_UP')}>
                      Reabrir
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-2xl mx-4 relative p-6 space-y-6 max-h-[90vh] overflow-y-auto" withStripe>
            <button
              onClick={() => {
                setIsCreateModalOpen(false);
                resetForm();
              }}
              className="absolute top-4 right-4 text-brand-grey hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-lg font-black italic uppercase tracking-tight text-white">
                Nova Interacao de CRM
              </h3>
              <p className="text-[10px] text-brand-grey font-mono uppercase tracking-widest mt-1">
                Registre atendimento, retorno, visita ou follow-up
              </p>
            </div>

            <form onSubmit={handleCreateInteraction} className="space-y-4 text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Cliente</label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                    required
                  >
                    <option value="">Selecione o cliente</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.full_name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Tipo</label>
                  <select
                    value={interactionType}
                    onChange={(e) => setInteractionType(e.target.value as InteractionType)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                  >
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="CALL">Ligacao</option>
                    <option value="EMAIL">E-mail</option>
                    <option value="VISIT">Visita</option>
                    <option value="NOTE">Nota</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Prioridade</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as CrmPriority)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                  >
                    <option value="LOW">Baixa</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">Alta</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as CrmStatus)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                  >
                    <option value="OPEN">Aberto</option>
                    <option value="FOLLOW_UP">Follow-up</option>
                    <option value="DONE">Concluído</option>
                    <option value="CANCELLED">Cancelado</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Data do Follow-up</label>
                  <Input
                    type="datetime-local"
                    value={followUpAt}
                    onChange={(e) => setFollowUpAt(e.target.value)}
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Assunto</label>
                  <Input
                    placeholder="Ex: Retorno sobre orçamento da revisão"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Descrição do Atendimento</label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Resultado / Proximo Passo</label>
                  <textarea
                    rows={2}
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-brand-grey/10">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    resetForm();
                    info('Cadastro cancelado', 'Nenhuma interacao foi registrada.');
                  }}
                >
                  CANCELAR
                </Button>
                <Button type="submit" variant="primary" disabled={isSaving}>
                  {isSaving ? 'Salvando...' : 'REGISTRAR CRM'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {showSuccessOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-brand-card border border-emerald-500/35 p-8 rounded shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-500">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black tracking-wider uppercase text-emerald-500 leading-tight">
              INTERACAO DE CRM REGISTRADA COM SUCESSO!
            </h3>
            <p className="text-[11px] text-brand-grey leading-normal">
              O histórico do cliente foi atualizado no banco de dados.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
