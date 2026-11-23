import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { comments, communityPosts, reports } from '@/db/schema';
import { route } from '@/lib/http';

export const GET = route({ perm: 'moderation.manage' }, async ({ query }) => {
  const rows = await db.select().from(reports).where(eq(reports.status, (query.get('status') ?? 'OPEN') as never)).orderBy(desc(reports.createdAt)).limit(200);
  const withTarget = await Promise.all(rows.map(async (r) => {
    let target: unknown = null;
    if (r.targetType === 'post') [target] = await db.select().from(communityPosts).where(eq(communityPosts.id, r.targetId));
    if (r.targetType === 'comment') [target] = await db.select().from(comments).where(eq(comments.id, r.targetId));
    return { ...r, target: target ?? null };
  }));
  return { items: withTarget };
});
