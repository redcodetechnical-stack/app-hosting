import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { comments, communityPosts, reports, sessions, users } from '@/db/schema';
import { route, notFound } from '@/lib/http';
import { audit } from '@/lib/audit';

/** action: hide (post/comment), suspend_user, dismiss. */
export const PATCH = route({ perm: 'moderation.manage', body: z.object({ action: z.enum(['hide', 'suspend_user', 'dismiss']) }) }, async ({ user, params, body, ip }) => {
  const [r] = await db.select().from(reports).where(eq(reports.id, params.id));
  if (!r) throw notFound();
  if (body.action === 'hide') {
    if (r.targetType === 'post') await db.update(communityPosts).set({ hidden: true }).where(eq(communityPosts.id, r.targetId));
    if (r.targetType === 'comment') await db.update(comments).set({ hidden: true }).where(eq(comments.id, r.targetId));
  }
  if (body.action === 'suspend_user') {
    let uid = r.targetId;
    if (r.targetType === 'post') uid = (await db.select().from(communityPosts).where(eq(communityPosts.id, r.targetId)))[0]?.authorId ?? '';
    if (r.targetType === 'comment') uid = (await db.select().from(comments).where(eq(comments.id, r.targetId)))[0]?.authorId ?? '';
    if (uid) { await db.update(users).set({ status: 'SUSPENDED', suspendedReason: `Community report ${r.id}` }).where(eq(users.id, uid)); await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, uid)); }
  }
  const [x] = await db.update(reports).set({ status: body.action === 'dismiss' ? 'DISMISSED' : 'ACTIONED', resolvedById: user.id }).where(eq(reports.id, r.id)).returning();
  await audit(user.id, `moderation.${body.action}`, { type: r.targetType, id: r.targetId }, { reportId: r.id }, ip);
  return x;
});
