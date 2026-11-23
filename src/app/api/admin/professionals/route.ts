import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { professionals, users } from '@/db/schema';
import { route, paging } from '@/lib/http';

export const GET = route({ perm: 'professionals.verify' }, async ({ query }) => {
  const { limit, offset, page } = paging(query, 100);
  const st = query.get('status');
  const rows = await db.select({ p: professionals, email: users.email }).from(professionals).innerJoin(users, eq(users.id, professionals.userId))
    .where(st ? eq(professionals.status, st as never) : undefined).orderBy(desc(professionals.createdAt)).limit(limit).offset(offset);
  return { items: rows.map((r) => ({ ...r.p, email: r.email })), page, limit };
});
