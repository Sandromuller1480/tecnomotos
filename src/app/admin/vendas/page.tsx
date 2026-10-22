'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CounterSaleModal } from '@/components/sales/CounterSaleModal';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';

export default function AdminSalesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      const [{ data: canSell }, { data: isOwner }] = await Promise.all([
        supabase.rpc('has_permission', {
          user_uuid: user.id,
          required_permission: 'orders.update'
        }),
        supabase.rpc('is_owner', { user_uuid: user.id })
      ]);

      if (!canSell && !isOwner) {
        router.replace('/403');
        return;
      }

      setIsAuthorized(true);
      setIsCheckingAccess(false);
    }

    void checkAccess();
  }, [router, supabase]);

  return (
    <div>
      {isCheckingAccess || !isAuthorized ? (
        <div className="space-y-4 border border-brand-grey/15 bg-brand-card p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : (
        <CounterSaleModal
          open
          variant="page"
          onClose={() => undefined}
          onCompleted={() => undefined}
        />
      )}
    </div>
  );
}
