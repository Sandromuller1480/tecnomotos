import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { FiscalOperationService } from '@/lib/services/fiscal/FiscalOperationService';

export async function POST(request: Request) {
  const webhookSecret = process.env.FOCUS_NFE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Webhook Focus NFe não configurado.' },
      { status: 503 }
    );
  }

  const providedSecret = request.headers.get('x-focusnfe-webhook-secret');
  if (!providedSecret || !secretsMatch(providedSecret, webhookSecret)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const rawBody = await request.text();
  const payloadHash = createHash('sha256').update(rawBody).digest('hex');

  try {
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const reference = extractReference(payload);

    if (!reference) {
      return NextResponse.json({ received: true, processed: false });
    }

    const fiscalService = new FiscalOperationService(createAdminClient());
    const result = await fiscalService.applyWebhook(reference, payloadHash, payload);

    return NextResponse.json({ received: true, ...result });
  } catch {
    return NextResponse.json({ received: true, processed: false });
  }
}

function secretsMatch(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return receivedBuffer.length === expectedBuffer.length
    && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function extractReference(payload: Record<string, unknown>) {
  const value = payload.ref || payload.referencia || payload.reference;
  return typeof value === 'string' ? value : null;
}
