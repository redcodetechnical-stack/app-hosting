import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { blocks } from '@/db/schema';
import { route, badRequest } from '@/lib/http';

export const GET = route({}, async ({ user }) => ({ items: await db.select({ blockedId: blocks.blockedId, createdAt: blocks.createdAt }).from(blocks).where(eq(blocks.blockerId, user.id)) }));
export const POST = route({ body: z.object({ userId: z.string() }) }, async ({ user, body }) => {
  if (body.userId === user.id) throw badRequest('You cannot block yourself');
  await db.insert(blocks).values({ blockerId: user.id, blockedId: body.userId }).onConflictDoNothing();
  return { ok: true, blocked: true };
});
export const DELETE = route({}, async ({ user, query }) => {
  await db.delete(blocks).where(and(eq(blocks.blockerId, user.id), eq(blocks.blockedId, query.get('userId') ?? '')));
  return { ok: true, blocked: false };
});
