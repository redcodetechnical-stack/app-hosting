import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { route, notFound } from '@/lib/http';

export const PATCH = route({ body: z.object({ read: z.boolean() }) }, async ({ user, params, body }) => {
  const [r] = await db.update(notifications).set({ readAt: body.read ? new Date() : null }).where(and(eq(notifications.id, params.id), eq(notifications.userId, user.id))).returning();
  if (!r) throw notFound();
  return r;
});
export const DELETE = route({}, async ({ user, params }) => {
  const r = await db.delete(notifications).where(and(eq(notifications.id, params.id), eq(notifications.userId, user.id))).returning();
  if (!r.length) throw notFound();
  return { ok: true };
});
