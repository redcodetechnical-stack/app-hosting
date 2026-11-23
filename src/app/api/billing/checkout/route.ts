import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { payments } from '@/db/schema';
import { route, ApiError, notConfigured } from '@/lib/http';
import { configured, env } from '@/lib/env';
import { PLANS } from '@/lib/plans';
import { priceWithCoupon } from '@/lib/billing';
import { razorpayCreateOrder, stripeCheckout } from '@/lib/payments';

/** Creates a one-month order. Razorpay: returns order details for Checkout.js; Stripe: returns a hosted checkout URL. */
export const POST = route({ body: z.object({ plan: z.enum(['PREMIUM', 'FAMILY']), coupon: z.string().max(40).optional() }), rate: [10, 600] }, async ({ user, body }) => {
  if (!configured.payments()) throw notConfigured(`Payments (${env.paymentProvider})`);
  const price = await priceWithCoupon(body.plan, body.coupon);
  if (body.coupon && !price.coupon) throw new ApiError(400, 'invalid_coupon', 'This coupon is not valid');
  const [p] = await db.insert(payments).values({ userId: user.id, plan: body.plan, provider: env.paymentProvider, amountPaise: price.amountPaise, couponCode: price.coupon?.code ?? null }).returning();
  if (env.paymentProvider === 'stripe') {
    const s = await stripeCheckout({ amountPaise: price.amountPaise, planName: PLANS[body.plan].name, userId: user.id, paymentId: p.id, email: user.email });
    await db.update(payments).set({ providerOrderId: s.id }).where(eq(payments.id, p.id));
    return { provider: 'stripe', paymentId: p.id, checkoutUrl: s.url, amountPaise: price.amountPaise };
  }
  const o = await razorpayCreateOrder(price.amountPaise, p.id, { userId: user.id, plan: body.plan });
  await db.update(payments).set({ providerOrderId: o.id }).where(eq(payments.id, p.id));
  return { provider: 'razorpay', paymentId: p.id, keyId: env.razorpayKeyId, orderId: o.id, amountPaise: o.amount, currency: o.currency, name: 'Vitalora', description: `${PLANS[body.plan].name} plan, 1 month` };
});
