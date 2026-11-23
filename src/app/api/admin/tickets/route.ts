import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { supportTickets, users } from '@/db/schema';
import { route, paging } from '@/lib/http';

export const GET = route({ perm: 'support.manage' }, async ({ query, user }) => {
  const { limit, offset, page } = paging(query, 200);
  const st = query.get('status'), mine = query.get('assigned') === 'me';
  const rows = await db.select({ t: supportTickets, email: users.email }).from(supportTickets).innerJoin(users, eq(users.id, supportTickets.userId))
    .where(and(st ? eq(supportTickets.status, st as never) : undefined, mine ? eq(supportTickets.assigneeId, user.id) : undefined)).orderBy(desc(supportTickets.updatedAt)).limit(limit).offset(offset);
  return { items: rows.map((r) => ({ ...r.t, email: r.email })), page, limit };
});
