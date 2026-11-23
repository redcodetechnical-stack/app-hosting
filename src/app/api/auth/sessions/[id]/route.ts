import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { sessions } from '@/db/schema';
import { route, notFound } from '@/lib/http';

export const DELETE = route({}, async ({ user, params }) => {
  const r = await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, params.id), eq(sessions.userId, user.id))).returning({ id: sessions.id });
  if (!r.length) throw notFound();
  return { ok: true };
});
