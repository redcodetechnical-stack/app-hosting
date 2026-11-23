import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { integrations, payments, webhookEvents } from '@/db/schema';
import { json } from '@/lib/http';
import { env } from '@/lib/env';
import { hmac, safeEqual } from '@/lib/crypto';
import { razorpayVerifyWebhook, stripeVerifyWebhook } from '@/lib/payments';
import { syncProvider } from '@/lib/integrations';
import { activatePayment } from '@/lib/billing';

/** Signed webhooks. Every event is stored once (idempotent by provider + event id) before processing. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  // Fitbit subscriber verification handshake
  const { provider } = await ctx.params;
  if (provider === 'fitbit') return new Response(null, { status: req.nextUrl.searchParams.get('verify') === env.fitbitVerifyCode && env.fitbitVerifyCode ? 204 : 404 });
  return new Response(null, { status: 404 });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const raw = await req.text();
  let ok = false, eventId: string | null = null, payload: any;
  try { payload = JSON.parse(raw); } catch { return json({ error: { code: 'bad_json' } }, 400); }
  if (provider === 'razorpay') { ok = razorpayVerifyWebhook(raw, req.headers.get('x-razorpay-signature')); eventId = req.headers.get('x-razorpay-event-id'); }
  else if (provider === 'stripe') { ok = stripeVerifyWebhook(raw, req.headers.get('stripe-signature')); eventId = payload?.id ?? null; }
  else if (provider === 'fitbit') { ok = !!env.fitbitClientSecret && safeEqual(createHmac('sha1', `${env.fitbitClientSecret}&`).update(raw).digest('base64'), req.headers.get('x-fitbit-signature') ?? ''); eventId = null; }
  else if (provider === 'whoop') { const ts = req.headers.get('x-whoop-signature-timestamp') ?? ''; ok = !!env.whoopClientSecret && safeEqual(hmac(env.whoopClientSecret, ts + raw, 'base64'), req.headers.get('x-whoop-signature') ?? ''); eventId = payload?.trace_id ?? null; }
  else return json({ error: { code: 'not_found' } }, 404);
  if (!ok) return json({ error: { code: 'bad_signature', message: 'Signature verification failed' } }, 401);

  const [ev] = await db.insert(webhookEvents).values({ provider, externalId: eventId, payload }).onConflictDoNothing().returning();
  if (!ev) return json({ ok: true, duplicate: true });
  try {
    if (provider === 'razorpay' && payload.event === 'payment.captured') {
      const p = payload.payload.payment.entity;
      await activatePayment({ providerOrderId: p.order_id, providerPaymentId: p.id });
    } else if (provider === 'razorpay' && payload.event === 'payment.failed') {
      await db.update(payments).set({ status: 'FAILED' }).where(eq(payments.providerOrderId, payload.payload.payment.entity.order_id));
    } else if (provider === 'stripe' && payload.type === 'checkout.session.completed') {
      const s = payload.data.object;
      await activatePayment({ paymentId: s.client_reference_id, providerOrderId: s.id, providerPaymentId: s.payment_intent });
    } else if (provider === 'stripe' && payload.type === 'charge.refunded') {
      await db.update(payments).set({ status: 'REFUNDED' }).where(eq(payments.providerPaymentId, payload.data.object.payment_intent));
    } else if (provider === 'fitbit' || provider === 'whoop') {
      const list = Array.isArray(payload) ? payload : [payload];
      for (const n of list) {
        const ext = String(n.ownerId ?? n.user_id ?? '');
        const [row] = await db.select().from(integrations).where(and(eq(integrations.externalUserId, ext), eq(integrations.provider, provider.toUpperCase() as never)));
        if (row) await syncProvider(row, 2);
      }
    }
    await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, ev.id));
  } catch (e) {
    await db.update(webhookEvents).set({ error: String((e as Error).message) }).where(eq(webhookEvents.id, ev.id));
    return json({ error: { code: 'processing_failed' } }, 500); // provider will retry
  }
  return json({ ok: true });
}

