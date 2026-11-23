import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { payments, refunds } from '@/db/schema';
import { route, ApiError, notFound } from '@/lib/http';

/** User refund request; an admin approves or rejects it in /api/admin/refunds. */
export const POST = route({ body: z.object({ paymentId: z.string(), reason: z.string().trim().min(5).max(500) }), rate: [5, 3600] }, async ({ user, body }) => {
  const [p] = await db.select().from(payments).where(and(eq(payments.id, body.paymentId), eq(payments.userId, user.id)));
  if (!p) throw notFound('Payment not found');
  if (p.status !== 'PAID') throw new ApiError(400, 'not_refundable', 'Only paid payments can be refunded');
  const [r] = await db.insert(refunds).values({ paymentId: p.id, amountPaise: p.amountPaise, reason: body.reason }).returning();
  return Response.json(r, { status: 201 });
});
