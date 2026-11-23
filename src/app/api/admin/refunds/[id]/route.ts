import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { payments, refunds, subscriptions } from '@/db/schema';
import { route, notFound, ApiError } from '@/lib/http';
import { razorpayRefund, stripeRefund } from '@/lib/payments';
import { audit } from '@/lib/audit';

/** Approve (executes the refund with the provider, cancels the subscription) or reject. */
export const PATCH = route({ perm: 'payments.refund', body: z.object({ decision: z.enum(['APPROVE', 'REJECT']), amountPaise: z.number().int().min(100).optional() }) }, async ({ user, params, body, ip }) => {
  const [r] = await db.select().from(refunds).where(eq(refunds.id, params.id));
  if (!r) throw notFound();
  if (r.status !== 'REQUESTED') throw new ApiError(409, 'already_decided', 'This refund was already decided');
  if (body.decision === 'REJECT') {
    const [x] = await db.update(refunds).set({ status: 'REJECTED', decidedById: user.id }).where(eq(refunds.id, r.id)).returning();
    await audit(user.id, 'admin.refund_reject', { type: 'refund', id: r.id }, undefined, ip);
    return x;
  }
  const [p] = await db.select().from(payments).where(eq(payments.id, r.paymentId));
  const amt = Math.min(body.amountPaise ?? r.amountPaise, p.amountPaise);
  if (!p.providerPaymentId) throw new ApiError(409, 'no_provider_payment', 'Payment has no provider reference');
  const res = p.provider === 'stripe' ? await stripeRefund(p.providerPaymentId, amt) : await razorpayRefund(p.providerPaymentId, amt);
  const [x] = await db.update(refunds).set({ status: 'PROCESSED', amountPaise: amt, providerRefundId: res.id, decidedById: user.id }).where(eq(refunds.id, r.id)).returning();
  await db.update(payments).set({ status: amt < p.amountPaise ? 'PARTIALLY_REFUNDED' : 'REFUNDED' }).where(eq(payments.id, p.id));
  if (p.subscriptionId && amt >= p.amountPaise) await db.update(subscriptions).set({ status: 'CANCELLED', cancelledAt: new Date() }).where(eq(subscriptions.id, p.subscriptionId));
  await audit(user.id, 'admin.refund_process', { type: 'refund', id: r.id }, { amt }, ip);
  return x;
});
