import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { coupons, payments, subscriptions, users } from '@/db/schema';
import { notify } from './messaging';
import { PLANS, type Plan } from './plans';

/** Marks a payment PAID (idempotent), starts/extends a 30-day subscription, issues an invoice number. */
export async function activatePayment(k: { paymentId?: string; providerOrderId?: string; providerPaymentId?: string }) {
  const where = k.paymentId ? eq(payments.id, k.paymentId) : eq(payments.providerOrderId, k.providerOrderId!);
  const [p] = await db.select().from(payments).where(where);
  if (!p) throw new Error('payment_not_found');
  if (p.status === 'PAID') return p;
  return db.transaction(async (tx) => {
    const invoiceNo = `VT-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;
    const now = new Date();
    const [existing] = await tx.select().from(subscriptions).where(and(eq(subscriptions.userId, p.userId), eq(subscriptions.status, 'ACTIVE')));
    const base = existing?.currentPeriodEnd && existing.currentPeriodEnd > now && existing.plan === p.plan ? existing.currentPeriodEnd : now;
    const end = new Date(base.getTime() + 30 * 864e5);
    await tx.update(subscriptions).set({ status: 'CANCELLED', cancelledAt: now }).where(and(eq(subscriptions.userId, p.userId), sql`${subscriptions.status} in ('TRIALING','ACTIVE','PAST_DUE')`));
    const [s] = await tx.insert(subscriptions).values({ userId: p.userId, plan: p.plan!, status: 'ACTIVE', provider: p.provider, currentPeriodEnd: end }).returning();
    const [upd] = await tx.update(payments).set({ status: 'PAID', providerPaymentId: k.providerPaymentId ?? p.providerPaymentId, subscriptionId: s.id, invoiceNo }).where(eq(payments.id, p.id)).returning();
    if (p.couponCode) await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.code, p.couponCode));
    return upd;
  }).then(async (upd) => {
    const [u] = await db.select().from(users).where(eq(users.id, p.userId));
    await notify({ userId: p.userId, type: 'SYSTEM', title: 'Payment received', body: `Your ${PLANS[p.plan as Plan].name} plan is active. Invoice ${upd.invoiceNo}.`, channels: ['EMAIL'], email: u?.email, dedupeKey: `pay:${p.id}` });
    return upd;
  });
}

export async function priceWithCoupon(plan: Plan, code?: string) {
  const base = PLANS[plan].pricePaise;
  if (!code) return { amountPaise: base, coupon: null as null | typeof coupons.$inferSelect };
  const [c] = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase()));
  const valid = c && c.active && (!c.expiresAt || c.expiresAt > new Date()) && (c.maxUses == null || c.usedCount < c.maxUses) && (!c.plans.length || c.plans.includes(plan));
  if (!valid) return { amountPaise: base, coupon: null, invalid: true };
  const off = c.percentOff ? Math.round((base * c.percentOff) / 100) : c.amountOffPaise ?? 0;
  return { amountPaise: Math.max(100, base - off), coupon: c };
}
