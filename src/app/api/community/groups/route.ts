import { z } from 'zod';
import { asc, count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { communityGroups, groupMembers } from '@/db/schema';
import { route } from '@/lib/http';

export const GET = route({}, async ({ user }) => {
  const gs = await db.select({ g: communityGroups, members: count(groupMembers.id) }).from(communityGroups).leftJoin(groupMembers, eq(groupMembers.groupId, communityGroups.id)).groupBy(communityGroups.id).orderBy(asc(communityGroups.name));
  const mine = new Set((await db.select().from(groupMembers).where(eq(groupMembers.userId, user.id))).map((m) => m.groupId));
  return { items: gs.map(({ g, members }) => ({ ...g, members, joined: mine.has(g.id) })) };
});
export const POST = route({ body: z.object({ name: z.string().trim().min(3).max(60), description: z.string().max(500).optional() }), rate: [5, 3600] }, async ({ user, body }) => {
  const [g] = await db.insert(communityGroups).values({ ...body, createdById: user.id }).returning();
  await db.insert(groupMembers).values({ groupId: g.id, userId: user.id });
  return Response.json(g, { status: 201 });
});
