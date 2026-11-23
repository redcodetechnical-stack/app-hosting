import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { aiConversations } from '@/db/schema';
import { route, paging } from '@/lib/http';

export const GET = route({}, async ({ user, query }) => {
  const { limit, offset, page } = paging(query);
  return { items: await db.select().from(aiConversations).where(eq(aiConversations.userId, user.id)).orderBy(desc(aiConversations.updatedAt)).limit(limit).offset(offset), page, limit };
});
