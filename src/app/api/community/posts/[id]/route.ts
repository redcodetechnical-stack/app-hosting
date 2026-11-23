import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { communityPosts } from '@/db/schema';
import { route, notFound } from '@/lib/http';

export const PATCH = route({ body: z.object({ body: z.string().trim().min(1).max(3000) }) }, async ({ user, params, body }) => {
  const [r] = await db.update(communityPosts).set({ body: body.body }).where(and(eq(communityPosts.id, params.id), eq(communityPosts.authorId, user.id))).returning();
  if (!r) throw notFound();
  return r;
});
export const DELETE = route({}, async ({ user, params }) => {
  const r = await db.delete(communityPosts).where(and(eq(communityPosts.id, params.id), eq(communityPosts.authorId, user.id))).returning();
  if (!r.length) throw notFound();
  return { ok: true };
});
