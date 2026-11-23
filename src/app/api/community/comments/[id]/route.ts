import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { comments } from '@/db/schema';
import { route, notFound } from '@/lib/http';

export const DELETE = route({}, async ({ user, params }) => {
  const r = await db.delete(comments).where(and(eq(comments.id, params.id), eq(comments.authorId, user.id))).returning();
  if (!r.length) throw notFound();
  return { ok: true };
});
