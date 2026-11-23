import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { payments, refunds } from '@/db/schema';
import { route } from '@/lib/http';

export const GET = route({ perm: ['payments.refund', 'payments.read'] }, async ({ query }) => {
  const st = query.get('status');
  const rows = await db.select({ r: refunds, p: payments }).from(refunds).innerJoin(payments, eq(payments.id, refunds.paymentId)).where(st ? eq(refunds.status, st as never) : undefined).orderBy(desc(refunds.createdAt)).limit(200);
  return { items: rows.map(({ r, p }) => ({ ...r, payment: { id: p.id, userId: p.userId, amountPaise: p.amountPaise, provider: p.provider, status: p.status } })) };
});
