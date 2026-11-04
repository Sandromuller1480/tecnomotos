'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/ui/logo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { UserPlus } from 'lucide-react';
import { z } from 'zod';
import Link from 'next/link';

const registerSchema = z
  .object({
    fullName: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres.'),
    email: z.string().email('Por favor, informe um e-mail válido.'),
    phone: z.string().min(8, 'Informe um telefone válido.'),
    document: z.string().refine((value) => {
      const digits = value.replace(/\D/g, '');
      return digits.length === 11 || digits.length === 14;
    }, 'Informe um CPF ou CNPJ válido.'),
    street: z.string().min(3, 'Informe a rua.'),
    number: z.string().min(1, 'Informe o número.'),
    complement: z.string().optional(),
    neighborhood: z.string().min(2, 'Informe o bairro.'),
    city: z.string().min(2, 'Informe a cidade.'),
    state: z.string().length(2, 'Informe a UF com 2 caracteres (ex: SP).'),
    postalCode: z.string().min(8, 'CEP deve ter 8 dígitos.'),
    password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
    confirmPassword: z.string().min(6, 'A confirmação deve ter pelo menos 6 caracteres.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  const { success, error } = useToast();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [document, setDocument] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFormErrors({});

    // Zod validation
    const validationResult = registerSchema.safeParse({
      fullName,
      email,
      phone,
      document,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      postalCode,
      password,
      confirmPassword,
    });

    if (!validationResult.success) {
      const formattedErrors: Record<string, string> = {};
      validationResult.error.issues.forEach((err) => {
        const fieldName = err.path[0] as string;
        formattedErrors[fieldName] = err.message;
      });
      setFormErrors(formattedErrors);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: fullName,
            phone: phone,
            document: document.replace(/\D/g, ''),
            address_street: street,
            address_number: number,
            address_complement: complement,
            address_neighborhood: neighborhood,
            address_city: city,
            address_state: state.toUpperCase(),
            address_postal_code: postalCode,
          },
        },
      });

      if (authError) {
        error('Falha no Cadastro', authError.message);
        setIsLoading(false);
        return;
      }

      if (data.session) {
        success('Cadastro Realizado!', 'Sua conta foi criada com sucesso.');
        router.push('/cliente');
      } else {
        success('Confirmar E-mail', 'Enviamos um link de confirmação para o seu e-mail.');
        router.push('/login');
      }
      
      router.refresh();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Falha ao processar o cadastro.';
      error('Erro Inesperado', errMsg);
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-brand-black text-white flex flex-col items-center justify-center p-4 telemetry-grid">
      <div className="w-full max-w-2xl py-8">
        <Card className="skew-x-[-2deg] border border-brand-grey/15" withStripe>
          <div className="skew-x-[2deg] flex flex-col items-center">
            {/* Header / Logo */}
            <Link href="/" className="cursor-pointer hover:opacity-90 transition-opacity">
              <Logo className="mb-6" />
            </Link>

            <h2 className="text-lg font-black italic uppercase tracking-wider text-white mb-2">
              Cadastro de Cliente
            </h2>
            <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mb-8">
              Crie sua conta para acessar a plataforma
            </p>

            <form onSubmit={handleSubmit} className="w-full space-y-6 text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Coluna 1: Dados Pessoais & Credenciais */}
                <div className="space-y-4">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-brand-red border-b border-brand-grey/15 pb-2 mb-4">
                    Dados de Acesso
                  </h3>

                  <Input
                    label="Nome Completo"
                    type="text"
                    placeholder="Seu nome completo"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    error={formErrors.fullName}
                    disabled={isLoading}
                    required
                  />

                  <Input
                    label="E-mail"
                    type="email"
                    placeholder="seu-email@provedor.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    error={formErrors.email}
                    disabled={isLoading}
                    required
                  />

                  <Input
                    label="Telefone / WhatsApp"
                    type="text"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    error={formErrors.phone}
                    disabled={isLoading}
                    required
                  />

                  <Input
                    label="CPF / CNPJ"
                    type="text"
                    inputMode="numeric"
                    placeholder="Somente números"
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    error={formErrors.document}
                    disabled={isLoading}
                    required
                  />

                  <Input
                    label="Senha de Segurança"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    error={formErrors.password}
                    disabled={isLoading}
                    required
                  />

                  <Input
                    label="Confirmar Senha"
                    type="password"
                    placeholder="Repita sua senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    error={formErrors.confirmPassword}
                    disabled={isLoading}
                    required
                  />
                </div>

                {/* Coluna 2: Dados de Endereço */}
                <div className="space-y-4">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-brand-red border-b border-brand-grey/15 pb-2 mb-4">
                    Endereço de Entrega
                  </h3>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <Input
                        label="CEP"
                        type="text"
                        placeholder="00000-000"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        error={formErrors.postalCode}
                        disabled={isLoading}
                        required
                      />
                    </div>
                    <div className="col-span-1">
                      <Input
                        label="Estado (UF)"
                        type="text"
                        placeholder="SP"
                        maxLength={2}
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        error={formErrors.state}
                        disabled={isLoading}
                        required
                      />
                    </div>
                  </div>

                  <Input
                    label="Rua / Logradouro"
                    type="text"
                    placeholder="Avenida Paulista"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    error={formErrors.street}
                    disabled={isLoading}
                    required
                  />

                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-1">
                      <Input
                        label="Número"
                        type="text"
                        placeholder="123"
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        error={formErrors.number}
                        disabled={isLoading}
                        required
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        label="Complemento"
                        type="text"
                        placeholder="Apto 42 (Opcional)"
                        value={complement}
                        onChange={(e) => setComplement(e.target.value)}
                        error={formErrors.complement}
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <Input
                    label="Bairro"
                    type="text"
                    placeholder="Centro"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    error={formErrors.neighborhood}
                    disabled={isLoading}
                    required
                  />

                  <Input
                    label="Cidade"
                    type="text"
                    placeholder="São Paulo"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    error={formErrors.city}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-brand-grey/15">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={isLoading}
                >
                  <UserPlus className="w-4 h-4 shrink-0" />
                  {isLoading ? 'Criando Conta...' : 'Cadastrar'}
                </Button>

                <p className="text-center text-[10px] text-brand-grey font-mono mt-6 uppercase tracking-normal whitespace-nowrap">
                  Já possui uma conta?{' '}
                  <Link href="/login" className="text-brand-red hover:underline font-bold">
                    Clique aqui para Entrar
                  </Link>
                </p>
              </div>
            </form>
          </div>
        </Card>
      </div>
    </main>
  );
}
