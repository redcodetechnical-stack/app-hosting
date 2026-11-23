import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { payments, users } from '@/db/schema';
import { route, paging } from '@/lib/http';

export const GET = route({ perm: 'payments.read' }, async ({ query }) => {
  const { limit, offset, page } = paging(query, 200);
  const st = query.get('status');
  const rows = await db.select({ p: payments, email: users.email }).from(payments).innerJoin(users, eq(users.id, payments.userId)).where(st ? eq(payments.status, st as never) : undefined).orderBy(desc(payments.createdAt)).limit(limit).offset(offset);
  return { items: rows.map((r) => ({ ...r.p, email: r.email })), page, limit };
});
