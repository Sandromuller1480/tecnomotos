'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, Check, AlertTriangle, Play, RefreshCw, Lock, Save } from 'lucide-react';

interface FiscalSettings {
  id: string;
  company_name: string;
  cnpj: string;
  state_registration: string;
  municipal_registration: string;
  uf: string;
  city: string;
  ibge_city_code: string;
  crt: string;
  tax_regime: string;
  nfe_series: string;
  nfce_series: string;
  nfce_next_number: number;
  environment: 'homologation' | 'production';
}

export default function AdminFiscalSettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { success, error, info } = useToast();

  const [settings, setSettings] = useState<FiscalSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: 'ONLINE' | 'OFFLINE' | 'UNAVAILABLE' | 'UNKNOWN';
    environment: string;
  } | null>(null);

  // State to manage environment change confirmation
  const [confirmProdText, setConfirmProdText] = useState('');
  const [tempEnvironment, setTempEnvironment] = useState<'homologation' | 'production'>('homologation');

  useEffect(() => {
    async function loadSettings() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Settings can only be loaded and saved by OWNER
      const { data: isOwner } = await supabase.rpc('is_owner', {
        user_uuid: user.id
      });

      if (!isOwner) {
        error('Acesso Negado', 'Somente proprietários possuem acesso a esta página.');
        router.push('/admin/fiscal');
        return;
      }

      const { data: fs, error: fsError } = await supabase
        .from('fiscal_settings')
        .select('*')
        .single();

      if (fsError && fsError.code !== 'PGRST116') {
        error('Erro ao Carregar', 'Falha ao buscar as configurações fiscais do banco de dados.');
      } else if (fs) {
        setSettings(fs as FiscalSettings);
        setTempEnvironment(fs.environment === 'production' ? 'production' : 'homologation');
      } else {
        setSettings({
          id: '',
          company_name: 'TECNOMOTOS',
          cnpj: '',
          state_registration: '',
          municipal_registration: '',
          uf: 'MT',
          city: 'Tangará da Serra',
          ibge_city_code: '5107958',
          crt: '1',
          tax_regime: 'Simples Nacional',
          nfe_series: '1',
          nfce_series: '1',
          nfce_next_number: 1,
          environment: 'homologation',
        });
      }
      setIsLoading(false);
    }

    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    // Strict validation to lock production unless confirmed explicitly
    if (tempEnvironment === 'production' && confirmProdText !== 'PRODUCAO') {
      error(
        'Ação Bloqueada',
        'Para ativar o ambiente de Produção, você deve digitar "PRODUCAO" no campo de confirmação.'
      );
      return;
    }

    setIsSaving(true);
    info('Salvando', 'Registrando configurações fiscais...');

    try {
      const payload = {
        ...settings,
        environment: tempEnvironment,
      };

      let result;
      if (settings.id) {
        result = await supabase
          .from('fiscal_settings')
          .update(payload)
          .eq('id', settings.id)
          .select()
          .single();
      } else {
        const { id, ...newPayload } = payload;
        result = await supabase
          .from('fiscal_settings')
          .insert(newPayload)
          .select()
          .single();
      }

      if (result.error) throw result.error;

      setSettings(result.data as FiscalSettings);
      success('Configurações Salvas', 'Os parâmetros tributários e fiscais foram gravados.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na gravação do banco.';
      error('Erro ao Salvar', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    info('Testando Conexão', 'Enviando pacote de handshake para a SEFAZ-MT...');

    try {
      const response = await fetch('/api/fiscal/test-connection', {
        method: 'POST',
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro no canal SOAP.');
      }

      setTestResult({
        status: result.status,
        environment: result.environment,
      });

      if (result.status === 'ONLINE') {
        success('SEFAZ Conectada', 'Serviço operacional e pronto para comunicação.');
      } else {
        error('SEFAZ Inacessível', `O serviço retornou status: ${result.status}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro no barramento fiscal.';
      error('Conexão Falhou', msg);
      setTestResult({
        status: 'OFFLINE',
        environment: tempEnvironment,
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 text-left">
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      <div>
        <Breadcrumb items={[{ label: 'Fiscal', href: '/admin/fiscal' }, { label: 'Configurações' }]} />
        <div className="flex justify-between items-center mt-2 border-b border-brand-grey/15 pb-4">
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
              Configurações Fiscais
            </h1>
            <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
              Parametrizador tributário e integração de Web Services da TECNOMOTOS
            </p>
          </div>
          <Badge variant="neutral" className="flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Acesso Restrito ao Proprietário
          </Badge>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main settings column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Empresa Section */}
            <Card className="space-y-4" withStripe>
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-brand-grey border-b border-brand-grey/10 pb-2">
                Dados da Empresa (Emitente)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Razão Social / Nome</label>
                  <Input
                    value={settings?.company_name || ''}
                    onChange={(e) => setSettings(s => s ? { ...s, company_name: e.target.value } : null)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">CNPJ</label>
                  <Input
                    placeholder="00.000.000/0000-00"
                    value={settings?.cnpj || ''}
                    onChange={(e) => setSettings(s => s ? { ...s, cnpj: e.target.value } : null)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Inscrição Estadual (IE)</label>
                  <Input
                    placeholder="Apenas números"
                    value={settings?.state_registration || ''}
                    onChange={(e) => setSettings(s => s ? { ...s, state_registration: e.target.value } : null)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Inscrição Municipal (IM)</label>
                  <Input
                    value={settings?.municipal_registration || ''}
                    onChange={(e) => setSettings(s => s ? { ...s, municipal_registration: e.target.value } : null)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Cidade / UF</label>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      className="col-span-2"
                      value={settings?.city || ''}
                      onChange={(e) => setSettings(s => s ? { ...s, city: e.target.value } : null)}
                      required
                    />
                    <Input
                      value={settings?.uf || 'MT'}
                      disabled
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Código IBGE Município</label>
                  <Input
                    placeholder="Tangará da Serra: 5107958"
                    value={settings?.ibge_city_code || ''}
                    onChange={(e) => setSettings(s => s ? { ...s, ibge_city_code: e.target.value } : null)}
                    required
                  />
                </div>
              </div>
            </Card>

            {/* Tributação Section */}
            <Card className="space-y-4">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-brand-grey border-b border-brand-grey/10 pb-2">
                Enquadramento Tributário
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Código Regime Tributário (CRT)</label>
                  <select
                    className="w-full bg-brand-input border border-brand-grey/25 text-white rounded px-3 py-2 text-sm font-sans focus:outline-none focus:border-brand-red"
                    value={settings?.crt || '1'}
                    onChange={(e) => setSettings(s => s ? { ...s, crt: e.target.value } : null)}
                  >
                    <option value="1">1 - Simples Nacional</option>
                    <option value="2">2 - Simples Nacional - Excesso sublimiar de receita bruta</option>
                    <option value="3">3 - Regime Normal (Lucro Real / Presumido)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Regime Tributário (Nome)</label>
                  <Input
                    value={settings?.tax_regime || ''}
                    onChange={(e) => setSettings(s => s ? { ...s, tax_regime: e.target.value } : null)}
                  />
                </div>
              </div>
            </Card>

            {/* Serie/Numero Section */}
            <Card className="space-y-4">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-brand-grey border-b border-brand-grey/10 pb-2">
                Série & Numeração Fiscal
              </h2>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-brand-grey uppercase">Série NF-e (Modelo 55)</label>
                  <Input
                    value={settings?.nfe_series || ''}
                    onChange={(e) => setSettings(s => s ? { ...s, nfe_series: e.target.value } : null)}
                    required
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* Sidebar / Environment configuration */}
          <div className="space-y-6">
            {/* Environment Picker */}
            <Card className="space-y-4" withStripe>
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-brand-grey border-b border-brand-grey/10 pb-2">
                Ambiente de Comunicação
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {(['homologation', 'production'] as const).map((env) => (
                    <button
                      key={env}
                      type="button"
                      onClick={() => setTempEnvironment(env)}
                      className={`text-xs font-mono py-2 px-1.5 rounded border transition-all ${
                        tempEnvironment === env
                          ? env === 'production'
                            ? 'bg-brand-red/20 border-brand-red text-brand-red font-bold'
                            : env === 'homologation'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-500 font-bold'
                            : 'bg-emerald-500/20 border-emerald-500 text-emerald-500 font-bold'
                          : 'bg-brand-input border-brand-grey/20 text-brand-grey hover:text-white'
                      }`}
                    >
                      {env.toUpperCase()}
                    </button>
                  ))}
                </div>

                {tempEnvironment === 'production' && (
                  <div className="space-y-3 bg-brand-red/10 border border-brand-red/20 p-3 rounded text-left">
                    <div className="flex gap-2 text-brand-red">
                      <ShieldAlert className="w-5 h-5 shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-tight leading-tight">
                        Cuidado: Ambiente de Produção
                      </span>
                    </div>
                    <p className="text-[10px] text-brand-grey leading-normal">
                      As notas emitidas em produção possuem validade jurídica real na Sefaz-MT. Digite <strong>PRODUCAO</strong> abaixo para autorizar:
                    </p>
                    <Input
                      placeholder="Confirmar"
                      value={confirmProdText}
                      onChange={(e) => setConfirmProdText(e.target.value)}
                      className="border-brand-red/35 text-center text-xs tracking-widest font-bold font-mono"
                    />
                  </div>
                )}

                {tempEnvironment === 'homologation' && (
                  <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded text-left">
                    <p className="text-[10px] text-brand-grey leading-relaxed">
                      💡 <strong>Ambiente de Homologação:</strong> Utiliza os endpoints oficiais de testes da SEFAZ-MT. Requer certificado digital configurado.
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* Certificado digital status */}
            <Card className="space-y-3">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-brand-grey border-b border-brand-grey/10 pb-2">
                Status do Certificado Digital A1
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-brand-input p-3 rounded border border-brand-grey/10">
                  <span className="text-xs text-brand-silver">Certificado A1 (.pfx)</span>
                  <Badge variant="success" className="flex items-center gap-1 font-bold">
                    <Check className="w-3 h-3" />
                    CONFIGURADO
                  </Badge>
                </div>
                <div className="flex justify-between items-center bg-brand-input p-3 rounded border border-brand-grey/10">
                  <span className="text-xs text-brand-silver">Senha do Certificado</span>
                  <span className="text-xs font-mono text-brand-grey">••••••••</span>
                </div>
                <p className="text-[9px] text-brand-grey leading-tight">
                  🔒 O certificado digital A1 e a senha de descriptografia estão protegidos no servidor (Environment Variables da Vercel).
                </p>
              </div>
            </Card>

            {/* SEFAZ MT Connection test */}
            <Card className="space-y-4">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-brand-grey border-b border-brand-grey/10 pb-2">
                Teste de Conectividade SEFAZ-MT
              </h2>
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full flex justify-center items-center gap-1.5"
                  disabled={isTesting}
                  onClick={handleTestConnection}
                >
                  {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  TESTAR CONEXÃO COM SEFAZ
                </Button>

                {testResult && (
                  <div className={`p-3 rounded border text-center ${
                    testResult.status === 'ONLINE'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                      : testResult.status === 'UNAVAILABLE'
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                      : 'bg-brand-red/10 border-brand-red/20 text-brand-red'
                  }`}>
                    <span className="text-xs font-bold tracking-tight">
                      {testResult.status === 'ONLINE' && '✓ Serviço disponível'}
                      {testResult.status === 'UNAVAILABLE' && '⚠ Serviço indisponível'}
                      {testResult.status === 'OFFLINE' && '✕ Erro de configuração'}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Form actions */}
        <div className="flex justify-end gap-3 border-t border-brand-grey/15 pt-6">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push('/admin/fiscal')}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSaving}
            className="flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </form>
    </div>
  );
}
