import { eq, or } from 'drizzle-orm';
import { db } from '@/db';
import { blocks } from '@/db/schema';

/** Users hidden from me: those I blocked and those who blocked me. */
export async function hiddenUserIds(userId: string) {
  const rows = await db.select().from(blocks).where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));
  return [...new Set(rows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)))];
}
