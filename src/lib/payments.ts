import { configured, env } from './env';
import { ApiError, notConfigured } from './http';
import { hmac, safeEqual } from './crypto';
import { withRetry } from './retry';

const rzpAuth = () => 'Basic ' + Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString('base64');

export async function razorpayCreateOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
  if (!configured.razorpay()) throw notConfigured('Razorpay');
  const r = await withRetry(() => fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST', headers: { Authorization: rzpAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
  }));
  const j = await r.json();
  if (!r.ok) throw new ApiError(502, 'payment_provider_error', j?.error?.description ?? 'Razorpay error');
  return j as { id: string; amount: number; currency: string };
}

export const razorpayVerifyPayment = (orderId: string, paymentId: string, signature: string) =>
  !!env.razorpayKeySecret && safeEqual(hmac(env.razorpayKeySecret, `${orderId}|${paymentId}`), signature);

export const razorpayVerifyWebhook = (raw: string, signature: string | null) =>
  !!env.razorpayWebhookSecret && !!signature && safeEqual(hmac(env.razorpayWebhookSecret, raw), signature);

export async function razorpayRefund(paymentId: string, amountPaise: number) {
  if (!configured.razorpay()) throw notConfigured('Razorpay');
  const r = await withRetry(() => fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: 'POST', headers: { Authorization: rzpAuth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: amountPaise }),
  }));
  const j = await r.json();
  if (!r.ok) throw new ApiError(502, 'payment_provider_error', j?.error?.description ?? 'Refund failed');
  return j as { id: string };
}

export async function stripeCheckout(o: { amountPaise: number; planName: string; userId: string; paymentId: string; email?: string | null }) {
  if (!configured.stripe()) throw notConfigured('Stripe');
  const p = new URLSearchParams({
    mode: 'payment', success_url: `${env.appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${env.appUrl}/plans`,
    'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'inr',
    'line_items[0][price_data][unit_amount]': String(o.amountPaise), 'line_items[0][price_data][product_data][name]': `Vitalora ${o.planName} (1 month)`,
    client_reference_id: o.paymentId, 'metadata[userId]': o.userId, 'metadata[paymentId]': o.paymentId,
  });
  if (o.email) p.set('customer_email', o.email);
  const r = await withRetry(() => fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${env.stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: p }));
  const j = await r.json();
  if (!r.ok) throw new ApiError(502, 'payment_provider_error', j?.error?.message ?? 'Stripe error');
  return j as { id: string; url: string };
}

/** Stripe-Signature: t=..,v1=.. ; signed payload "t.raw"; 5-minute tolerance. */
export function stripeVerifyWebhook(raw: string, header: string | null) {
  if (!env.stripeWebhookSecret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  return safeEqual(hmac(env.stripeWebhookSecret, `${parts.t}.${raw}`), parts.v1);
}

export async function stripeRefund(paymentIntent: string, amountPaise: number) {
  if (!configured.stripe()) throw notConfigured('Stripe');
  const r = await withRetry(() => fetch('https://api.stripe.com/v1/refunds', { method: 'POST', headers: { Authorization: `Bearer ${env.stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ payment_intent: paymentIntent, amount: String(amountPaise) }) }));
  const j = await r.json();
  if (!r.ok) throw new ApiError(502, 'payment_provider_error', j?.error?.message ?? 'Refund failed');
  return j as { id: string };
}
