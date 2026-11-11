'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { Briefcase, Check, ShieldAlert, X } from 'lucide-react';
import { createEmployeeAction } from './actions';

type EmployeeFunction = 'SELLER' | 'MECHANIC' | 'CASHIER' | 'FINANCIAL';

interface Employee {
  id: string;
  document: string | null;
  employee_function: EmployeeFunction | null;
  profiles?: {
    full_name: string;
    email: string;
    phone: string | null;
    status: string;
  };
}

const functionLabels: Record<EmployeeFunction, string> = {
  SELLER: 'Vendedor',
  MECHANIC: 'Mecânico',
  CASHIER: 'Caixa',
  FINANCIAL: 'Financeiro'
};
const profileStatusLabels: Record<string, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  BLOCKED: 'Bloqueado'
};

export default function AdminEmployeesPage() {
  const router = useRouter();
  const supabase = createClient();
  const { success, error, info } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [employeeFunction, setEmployeeFunction] = useState<EmployeeFunction>('SELLER');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const fetchEmployees = async () => {
    try {
      const { data, error: fetchErr } = await supabase
        .from('employees')
        .select(`
          id,
          document,
          employee_function,
          profiles!employees_id_fkey (
            full_name,
            email,
            phone,
            status
          )
        `)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      setEmployees((data || []).map((item: any) => ({
        id: item.id,
        document: item.document,
        employee_function: item.employee_function,
        profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
      })));
    } catch (err: any) {
      error('Erro ao carregar funcionários', err.message || 'Falha ao buscar equipe.');
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
        required_permission: 'employees.view'
      });

      if (!hasView) {
        router.push('/403');
        return;
      }

      const { data: hasCreate } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'employees.create'
      });

      setIsOwner(!!hasCreate);
      await fetchEmployees();
    }

    checkAuthAndLoad();
  }, []);

  const resetForm = () => {
    setFullName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setCpf('');
    setPhone('');
    setEmployeeFunction('SELLER');
    setStreet('');
    setNumber('');
    setComplement('');
    setNeighborhood('');
    setCity('');
    setState('');
    setPostalCode('');
  };

  const handleCreateEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName || !email || !password || !confirmPassword || !cpf || !phone || !street || !number || !neighborhood || !city || !state || !postalCode) {
      error('Campos Obrigatórios', 'Preencha nome, CPF, contato, senha, endereço e função.');
      return;
    }

    if (password.length < 6) {
      error('Senha inválida', 'A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      error('Senha inválida', 'A senha e a confirmação precisam ser iguais.');
      return;
    }

    setIsSaving(true);
    const res = await createEmployeeAction({
      fullName,
      email,
      password,
      cpf,
      phone,
      employeeFunction,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      postalCode
    });
    setIsSaving(false);

    if (!res.success) {
      error('Erro ao cadastrar', res.error || 'Falha ao registrar funcionário.');
      return;
    }

    resetForm();
    setIsModalOpen(false);
    setShowSuccessOverlay(true);
    setTimeout(() => setShowSuccessOverlay(false), 5000);
    success('Funcionário Cadastrado', 'O funcionário foi registrado no Supabase.');
    await fetchEmployees();
  };

  return (
    <div className="space-y-6 text-left">
      <div>
        <Breadcrumb items={[{ label: 'Equipe' }, { label: 'Funcionários' }]} />
        <div className="flex justify-between items-center mt-2 border-b border-brand-grey/15 pb-4">
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
              Gestao de Equipe
            </h1>
            <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
              Controle de acesso e funcionários da plataforma
            </p>
          </div>
          <Badge variant="neutral">Controle de Equipe</Badge>
        </div>
      </div>

      <Card className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-brand-grey/15 pb-4">
          <div>
            <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-white">
              Funcionários Cadastrados
            </h4>
            <p className="text-[11px] text-brand-grey mt-0.5">Gestao de operadores vinculados ao sistema.</p>
          </div>
          {isOwner ? (
            <Button size="sm" onClick={() => setIsModalOpen(true)}>Registrar Funcionário</Button>
          ) : (
            <div className="flex items-center gap-2 text-brand-grey text-xs font-mono bg-brand-darkgrey p-2 border border-brand-grey/10">
              <ShieldAlert className="w-4 h-4 text-brand-red" />
              <span>Apenas o proprietário pode gerenciar a equipe de funcionários.</span>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : employees.length === 0 ? (
          <div className="py-12 text-center text-brand-grey font-mono text-xs">
            Nenhum funcionário cadastrado.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell className="font-bold text-white">{emp.profiles?.full_name || '-'}</TableCell>
                  <TableCell className="font-mono">{emp.profiles?.email || '-'}</TableCell>
                  <TableCell className="font-mono">{emp.profiles?.phone || '-'}</TableCell>
                  <TableCell className="font-mono">{emp.document || '-'}</TableCell>
                  <TableCell>{emp.employee_function ? functionLabels[emp.employee_function] : '-'}</TableCell>
                  <TableCell>
                    <Badge variant={emp.profiles?.status === 'ACTIVE' ? 'success' : 'danger'}>
                      {profileStatusLabels[emp.profiles?.status || 'ACTIVE'] || emp.profiles?.status || 'Ativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {isOwner ? (
                      <Button variant="secondary" size="sm">Gerenciar permissões</Button>
                    ) : (
                      <span className="text-[11px] font-mono text-brand-grey uppercase">Bloqueado</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-2xl mx-4 relative p-6 space-y-6 max-h-[90vh] overflow-y-auto" withStripe>
            <button
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
              className="absolute top-4 right-4 text-brand-grey hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-lg font-black italic uppercase tracking-tight text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-brand-red" />
                Registrar Funcionário
              </h3>
              <p className="text-[10px] text-brand-grey font-mono uppercase tracking-widest mt-1">
                Cadastre o operador e defina sua função principal
              </p>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-6 text-left">
              <div className="space-y-4">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-brand-red border-b border-brand-grey/10 pb-1">
                  Dados do Funcionário
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Nome Completo</label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">CPF</label>
                    <Input value={cpf} onChange={(e) => setCpf(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">E-mail</label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Contato / WhatsApp</label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Senha</label>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Confirmar Senha</label>
                    <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Função</label>
                    <select
                      value={employeeFunction}
                      onChange={(e) => setEmployeeFunction(e.target.value as EmployeeFunction)}
                      className="w-full text-xs font-mono bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 focus:outline-none focus:border-brand-red"
                    >
                      <option value="SELLER">Vendedor</option>
                      <option value="MECHANIC">Mecânico</option>
                      <option value="CASHIER">Caixa</option>
                      <option value="FINANCIAL">Financeiro</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-brand-red border-b border-brand-grey/10 pb-1">
                  Endereço
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Logradouro / Rua</label>
                    <Input value={street} onChange={(e) => setStreet(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Número</label>
                    <Input value={number} onChange={(e) => setNumber(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Complemento</label>
                    <Input value={complement} onChange={(e) => setComplement(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Bairro</label>
                    <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Cidade</label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">Estado (UF)</label>
                    <Input value={state} onChange={(e) => setState(e.target.value)} maxLength={2} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-brand-grey uppercase">CEP</label>
                    <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-brand-grey/10">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                    info('Cadastro cancelado', 'Nenhum funcionário foi registrado.');
                  }}
                >
                  CANCELAR
                </Button>
                <Button type="submit" variant="primary" disabled={isSaving}>
                  {isSaving ? 'Salvando...' : 'REGISTRAR FUNCIONARIO'}
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
              FUNCIONARIO REGISTRADO COM SUCESSO!
            </h3>
            <p className="text-[11px] text-brand-grey leading-normal">
              O acesso foi criado como funcionário. O funcionário já pode entrar com o e-mail e a senha cadastrados.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
