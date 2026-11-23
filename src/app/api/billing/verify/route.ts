import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { payments } from '@/db/schema';
import { route, ApiError, notFound } from '@/lib/http';
import { razorpayVerifyPayment } from '@/lib/payments';
import { activatePayment } from '@/lib/billing';

/** Razorpay Checkout success handler: verifies the HMAC signature before activating. (Webhook also activates; both are idempotent.) */
export const POST = route({ body: z.object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() }), rate: [20, 600] }, async ({ user, body }) => {
  const [p] = await db.select().from(payments).where(and(eq(payments.providerOrderId, body.razorpay_order_id), eq(payments.userId, user.id)));
  if (!p) throw notFound('Order not found');
  if (!razorpayVerifyPayment(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) throw new ApiError(400, 'bad_signature', 'Payment could not be verified');
  const done = await activatePayment({ providerOrderId: body.razorpay_order_id, providerPaymentId: body.razorpay_payment_id });
  return { ok: true, payment: done };
});
