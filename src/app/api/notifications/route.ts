import { and, desc, eq, isNull, count } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { route, paging } from '@/lib/http';

export const GET = route({}, async ({ user, query }) => {
  const { limit, offset, page } = paging(query);
  const where = query.get('unread') === 'true' ? and(eq(notifications.userId, user.id), isNull(notifications.readAt)) : eq(notifications.userId, user.id);
  const items = await db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(limit).offset(offset);
  const [{ n }] = await db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  return { items, unread: n, page, limit };
});
