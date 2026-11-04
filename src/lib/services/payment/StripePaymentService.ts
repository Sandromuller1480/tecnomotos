import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  PaymentService,
  CartItem,
  CheckoutSession,
  PaymentStatus,
  WebhookResult,
  RefundResult,
} from './PaymentService';

export class StripePaymentService extends PaymentService {
  private secretKey: string;
  private mode: string;
  private stripe: Stripe;

  constructor() {
    super();
    this.secretKey = process.env.STRIPE_SECRET_KEY || '';
    this.mode = process.env.STRIPE_MODE || 'test';
    this.stripe = new Stripe(this.secretKey, {
      apiVersion: '2025-01-27.acacia' as any
    });
  }

  /**
   * Creates a Stripe Checkout Session for a customer's order.
   * Recalculates all prices on the server-side to prevent fraud.
   */
  async createCheckoutSession(
    customerId: string,
    items: CartItem[],
    cancelUrl: string,
    successUrl: string,
    orderId?: string
  ): Promise<CheckoutSession> {
    console.log(`[Stripe] Creating checkout session for customer: ${customerId} and order: ${orderId}`);

    const supabase = createAdminClient();
    
    // Get user email
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', customerId)
      .single();
    
    const customerEmail = profile?.email || undefined;

    // Build checkout line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const item of items) {
      // Query product database to get active stripe price ID (and verify price)
      const { data: product } = await supabase
        .from('products')
        .select('id, name, price, stripe_price_id, stripe_product_id, image_url')
        .eq('id', item.id)
        .single();

      if (!product) {
        throw new Error(`Produto não encontrado no catálogo: ${item.name}`);
      }

      let priceId = product.stripe_price_id;

      // Sync on the fly if product isn't synchronized with Stripe yet
      if (!priceId) {
        const syncResult = await StripePaymentService.syncProductToStripe(product.id);
        if (!syncResult.success) {
          throw new Error(`Falha ao sincronizar produto ${product.name} com o Stripe: ${syncResult.error}`);
        }

        // Refetch synchronized product
        const { data: syncedProd } = await supabase
          .from('products')
          .select('stripe_price_id')
          .eq('id', product.id)
          .single();
        
        priceId = syncedProd?.stripe_price_id;
      }

      if (!priceId) {
        throw new Error(`Falha ao obter preço sincronizado do Stripe para o produto ${product.name}.`);
      }

      lineItems.push({
        price: priceId,
        quantity: item.quantity
      });
    }

    // Create session
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: customerEmail,
      metadata: {
        order_id: orderId || null,
        customer_id: customerId
      }
    });

    return {
      id: session.id,
      url: session.url || '',
      mode: this.mode,
    };
  }

  async getPaymentStatus(sessionId: string): Promise<PaymentStatus> {
    console.log(`[Stripe] Fetching payment status for session: ${sessionId}`);
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);

    return {
      id: session.payment_intent as string || '',
      status: session.payment_status === 'paid' ? 'paid' : 'unpaid',
      amount: (session.amount_total || 0) / 100,
      customerEmail: session.customer_details?.email || '',
    };
  }

  /**
   * Processes the Stripe Webhook signature and event.
   * Leverages db idempotency checks via stripe_processed_events to block duplicate runs.
   */
  async processWebhook(payload: string, signature: string): Promise<WebhookResult> {
    console.log('[Stripe Webhook] Received webhook event.');

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET environment variable is missing.');
    }

    try {
      const event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      const supabase = createAdminClient();

      // Check event idempotency
      const { data: existingEvent } = await supabase
        .from('stripe_processed_events')
        .select('event_id')
        .eq('event_id', event.id)
        .single();

      if (existingEvent) {
        return {
          processed: true,
          event: event.type,
          message: `Evento de ID ${event.id} já foi processado anteriormente.`
        };
      }

      // Handle event type
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.order_id;
        const userId = session.metadata?.customer_id;

        if (orderId) {
          await StripePaymentService.confirmOrderPayment(
            orderId,
            session.id,
            session.payment_intent as string || '',
            userId || null,
            supabase
          );
        }
      } else if (event.type === 'payment_intent.payment_failed') {
        const pi = event.data.object as Stripe.PaymentIntent;
        
        // Mark matching order as payment failed
        const { data: order } = await supabase
          .from('orders')
          .select('id')
          .eq('stripe_payment_intent_id', pi.id)
          .single();

        if (order) {
          await supabase
            .from('orders')
            .update({ status: 'payment_failed' })
            .eq('id', order.id);
        }
      }

      // Save processed event to database
      await supabase
        .from('stripe_processed_events')
        .insert({ event_id: event.id });

      return {
        processed: true,
        event: event.type,
        message: `Evento ${event.type} processado com sucesso e marcado como idempotente.`,
      };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Erro desconhecido';
      console.error('[Stripe Webhook Error] Webhook processing failed:', errMsg);
      return {
        processed: false,
        event: 'error',
        message: `Failed webhook construct/verification: ${errMsg}`,
      };
    }
  }

  async refundPayment(paymentId: string, amount?: number): Promise<RefundResult> {
    console.log(`[Stripe] Requesting refund for payment: ${paymentId}, amount: ${amount}`);
    const refund = await this.stripe.refunds.create({
      payment_intent: paymentId,
      amount: amount ? Math.round(amount * 100) : undefined
    });

    return {
      success: true,
      refundId: refund.id,
      status: refund.status || 'succeeded',
    };
  }

  /**
   * Helper function to confirm order payment, subtract inventory stock, and log audit entries.
   */
  private static async confirmOrderPayment(
    orderId: string,
    sessionId: string,
    paymentIntentId: string,
    userId: string | null,
    supabase: any
  ) {
    console.log(`[Stripe Webhook] Confirming payment for order: ${orderId}`);

    // Fetch order state
    const { data: order } = await supabase
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single();

    if (!order || order.status === 'paid') {
      console.log(`[Stripe Webhook] Order ${orderId} already paid or not found.`);
      return;
    }

    // 1. Set status to paid
    await supabase
      .from('orders')
      .update({
        status: 'paid',
        stripe_checkout_session_id: sessionId,
        stripe_payment_intent_id: paymentIntentId,
        payment_date: new Date().toISOString()
      })
      .eq('id', orderId);

    // 2. Fetch order items to deduct stock
    const { data: items } = await supabase
      .from('order_items')
      .select('product_id, quantity, unit_price')
      .eq('order_id', orderId);

    for (const item of (items || [])) {
      const { data: prod } = await supabase
        .from('products')
        .select('name, stock_quantity')
        .eq('id', item.product_id)
        .single();

      if (prod) {
        const oldStock = prod.stock_quantity || 0;
        const newStock = Math.max(0, oldStock - item.quantity);

        // Update stock
        await supabase
          .from('products')
          .update({ stock_quantity: newStock })
          .eq('id', item.product_id);

        // Insert audit log for inventory reduction
        await supabase
          .from('audit_logs')
          .insert({
            user_id: userId,
            action: 'INVENTORY_DEDUCTION',
            entity: 'products',
            entity_id: item.product_id,
            old_data: { stock_quantity: oldStock },
            new_data: { stock_quantity: newStock, reason: `Venda E-commerce OS #${orderId}` }
          });
      }
    }

    // 3. Log audit event for the completed purchase
    await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'STRIPE_PAYMENT_COMPLETED',
        entity: 'orders',
        entity_id: orderId,
        new_data: { session_id: sessionId, payment_intent: paymentIntentId }
      });
  }

  /**
   * Synchronizes a single product to Stripe.
   * If it doesn't exist, creates the product and initial price.
   * If it already exists, updates product info and creates a new Price if price changed.
   */
  static async syncProductToStripe(productId: string): Promise<{ success: boolean; error?: string }> {
    const secretKey = process.env.STRIPE_SECRET_KEY || '';
    if (!secretKey) {
      return { success: false, error: 'STRIPE_SECRET_KEY is missing in env configurations.' };
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: '2025-01-27.acacia' as any
    });

    const supabase = createAdminClient();

    try {
      // 1. Fetch product
      const { data: product, error: prodErr } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (prodErr || !product) {
        throw new Error(prodErr?.message || 'Produto não encontrado para sincronização.');
      }

      // Update status to syncing
      await supabase
        .from('products')
        .update({ stripe_sync_status: 'syncing' })
        .eq('id', productId);

      const centPrice = Math.round(product.price * 100);

      // Case A: Create new Stripe product
      if (!product.stripe_product_id) {
        console.log(`[Stripe Sync] Creating new product in Stripe: ${product.name}`);
        const stripeProd = await stripe.products.create({
          name: product.name,
          description: product.description || undefined,
          images: product.image_url ? [product.image_url] : undefined,
          metadata: { sku: product.sku }
        });

        const stripePrice = await stripe.prices.create({
          product: stripeProd.id,
          unit_amount: centPrice,
          currency: 'brl'
        });

        await supabase
          .from('products')
          .update({
            stripe_product_id: stripeProd.id,
            stripe_price_id: stripePrice.id,
            stripe_sync_status: 'synced',
            stripe_sync_error: null,
            stripe_last_synced_at: new Date().toISOString()
          })
          .eq('id', productId);
      } 
      // Case B: Update existing Stripe product
      else {
        console.log(`[Stripe Sync] Updating existing product: ${product.stripe_product_id}`);
        await stripe.products.update(product.stripe_product_id, {
          name: product.name,
          description: product.description || undefined,
          images: product.image_url ? [product.image_url] : undefined
        });

        let currentPriceId = product.stripe_price_id;

        // Check if price changed
        let priceChanged = true;
        if (currentPriceId) {
          try {
            const currentPrice = await stripe.prices.retrieve(currentPriceId);
            if (currentPrice.unit_amount === centPrice) {
              priceChanged = false;
            }
          } catch (e) {
            console.warn('[Stripe Sync] Failed to retrieve old price, creating new price anyway:', e);
          }
        }

        if (priceChanged) {
          console.log(`[Stripe Sync] Price changed for ${product.name}. Creating new price.`);
          
          // Disable old price if existing
          if (currentPriceId) {
            try {
              await stripe.prices.update(currentPriceId, { active: false });
            } catch (e) {
              console.warn('[Stripe Sync] Old price could not be disabled:', e);
            }
          }

          const newPrice = await stripe.prices.create({
            product: product.stripe_product_id,
            unit_amount: centPrice,
            currency: 'brl'
          });
          currentPriceId = newPrice.id;
        }

        await supabase
          .from('products')
          .update({
            stripe_price_id: currentPriceId,
            stripe_sync_status: 'synced',
            stripe_sync_error: null,
            stripe_last_synced_at: new Date().toISOString()
          })
          .eq('id', productId);
      }

      return { success: true };
    } catch (err: any) {
      const errMsg = err?.message || 'Erro inesperado ao sincronizar com Stripe.';
      console.error(`[Stripe Sync Error] Sync failed for product ${productId}:`, errMsg);

      await supabase
        .from('products')
        .update({
          stripe_sync_status: 'error',
          stripe_sync_error: errMsg
        })
        .eq('id', productId);

      return { success: false, error: errMsg };
    }
  }

  /**
   * Synchronizes all products currently marked as pending or with sync errors.
   */
  static async syncPendingProducts(): Promise<{ success: boolean; syncedCount: number; error?: string }> {
    const supabase = createAdminClient();
    try {
      const { data: pendingProds } = await supabase
        .from('products')
        .select('id')
        .or('stripe_sync_status.eq.pending,stripe_sync_status.eq.error');

      let count = 0;
      for (const p of (pendingProds || [])) {
        const res = await StripePaymentService.syncProductToStripe(p.id);
        if (res.success) count++;
      }

      return { success: true, syncedCount: count };
    } catch (e: any) {
      return { success: false, syncedCount: 0, error: e.message };
    }
  }
}
