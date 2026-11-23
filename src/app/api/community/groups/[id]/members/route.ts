import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { communityGroups, groupMembers } from '@/db/schema';
import { route, notFound } from '@/lib/http';

export const POST = route({}, async ({ user, params }) => {
  const [g] = await db.select().from(communityGroups).where(eq(communityGroups.id, params.id));
  if (!g) throw notFound();
  await db.insert(groupMembers).values({ groupId: g.id, userId: user.id }).onConflictDoNothing();
  return { ok: true, joined: true };
});
export const DELETE = route({}, async ({ user, params }) => {
  await db.delete(groupMembers).where(and(eq(groupMembers.groupId, params.id), eq(groupMembers.userId, user.id)));
  return { ok: true, joined: false };
});
