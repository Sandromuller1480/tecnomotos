'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CreditCard,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  Database,
  Link as LinkIcon
} from 'lucide-react';

export default function AdminSettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { success, error, info } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchStripeStats = async () => {
    try {
      // 1. Get synced count
      const { count: synced, error: syncErr } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('stripe_sync_status', 'synced');

      if (syncErr) throw syncErr;

      // 2. Get error count
      const { count: errs, error: errsErr } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('stripe_sync_status', 'error');

      if (errsErr) throw errsErr;

      // 3. Get last synced timestamp
      const { data: latest, error: latErr } = await supabase
        .from('products')
        .select('stripe_last_synced_at')
        .not('stripe_last_synced_at', 'is', null)
        .order('stripe_last_synced_at', { ascending: false })
        .limit(1);

      if (latErr) throw latErr;

      setSyncedCount(synced || 0);
      setErrorCount(errs || 0);
      setLastSynced(latest?.[0]?.stripe_last_synced_at || null);
    } catch (e: any) {
      console.warn('[Settings] Failed to fetch Stripe stats:', e.message);
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

      // Check settings permission
      const { data: hasView } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'settings.view'
      });

      if (!hasView) {
        router.push('/403');
        return;
      }

      const { data: hasCreate } = await supabase.rpc('has_permission', {
        user_uuid: user.id,
        required_permission: 'products.create'
      });

      setIsOwner(!!hasCreate);
      await fetchStripeStats();
    }

    checkAuthAndLoad();
  }, []);

  const handleSyncPendingAndErrors = async () => {
    setIsSyncing(true);
    info('Sincronizando', 'Forçando re-sincronização de pendências e erros...');
    try {
      const res = await fetch('/api/admin/stripe-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncAllPending: true })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao sincronizar');

      success('Sincronizado', 'Produtos sincronizados com sucesso no Stripe.');
      await fetchStripeStats();
    } catch (err: any) {
      error('Erro ao sincronizar', err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 text-left">
      <div>
        <Breadcrumb items={[{ label: 'Configurações' }]} />
        <div className="flex justify-between items-center mt-2 border-b border-brand-grey/15 pb-4">
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
              Configurações Gerais
            </h1>
            <p className="text-xs text-brand-grey uppercase tracking-widest font-mono mt-1">
              Ajuste as configurações globais da plataforma e integrações
            </p>
          </div>
          <Badge variant="neutral">Sistema</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Connection Status Card */}
        <Card className="p-6 space-y-4 md:col-span-2" withStripe>
          <div className="flex items-center gap-3 border-b border-brand-grey/15 pb-3">
            <CreditCard className="w-6 h-6 text-brand-red" />
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Integração de Pagamentos
              </h3>
              <p className="text-[10px] text-brand-grey font-mono uppercase tracking-widest">
                Gerencie credenciais de vendas e sincronização de estoque
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-brand-grey uppercase text-[10px] w-28">Situação:</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    Stripe conectado <CheckCircle className="w-3.5 h-3.5" />
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-brand-grey uppercase text-[10px] w-28">Modo:</span>
                  <Badge variant="neutral" className="text-[9px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                    TESTE
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-brand-grey uppercase text-[10px] w-28">Webhook:</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    Configurado <LinkIcon className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-brand-grey uppercase text-[10px] w-36">Última Sincronização:</span>
                  <span className="text-white flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-brand-grey" />
                    {lastSynced ? new Date(lastSynced).toLocaleString('pt-BR') : 'Nunca'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-brand-grey uppercase text-[10px] w-36">Sincronizados (Stripe):</span>
                  <span className="text-white font-bold">{syncedCount} produtos</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-brand-grey uppercase text-[10px] w-36">Pendências / Erros:</span>
                  <span className={errorCount > 0 ? 'text-brand-red font-bold flex items-center gap-1' : 'text-brand-grey'}>
                    {errorCount > 0 && <AlertTriangle className="w-3.5 h-3.5" />}
                    {errorCount} itens
                  </span>
                </div>
              </div>
            </div>
          )}

          {isOwner && (
            <div className="pt-4 border-t border-brand-grey/15 flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSyncPendingAndErrors}
                disabled={isSyncing}
              >
                <RefreshCw className={`w-4 h-4 mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
                Sincronizar Pendentes e Erros
              </Button>
            </div>
          )}
        </Card>

        {/* Credentials / Webhook Details Info */}
        <Card className="p-6 space-y-4" withStripe>
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white border-b border-brand-grey/15 pb-2">
            Detalhes do Webhook
          </h3>
          <div className="space-y-3 font-mono text-[10px] text-brand-grey leading-relaxed">
            <p>
              O endpoint de Webhook recebe transações e eventos de pagamento para faturamento e baixas automáticas de estoque:
            </p>
            <div className="bg-brand-black border border-brand-grey/10 p-2.5 rounded text-white overflow-x-auto select-all">
              https://tecnomotos.com.br/api/stripe/webhook
            </div>
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold pt-1">
              <Database className="w-4 h-4" />
              <span>Idempotência Ativa</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
