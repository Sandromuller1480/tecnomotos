import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StripePaymentService } from '@/lib/services/payment/StripePaymentService';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Validate session
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    // Check RBAC permission to modify products
    const { data: hasPermission } = await supabase.rpc('has_permission', {
      user_uuid: user.id,
      required_permission: 'products.update'
    });

    if (!hasPermission) {
      return NextResponse.json({ error: 'Você não tem permissão para sincronizar produtos.' }, { status: 403 });
    }

    const { productId, syncAllPending } = await request.json();

    if (syncAllPending) {
      const res = await StripePaymentService.syncPendingProducts();
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 500 });
      }
      return NextResponse.json({ success: true, syncedCount: res.syncedCount });
    }

    if (!productId) {
      return NextResponse.json({ error: 'productId é obrigatório.' }, { status: 400 });
    }

    const res = await StripePaymentService.syncProductToStripe(productId);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno no servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
