import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { habits } from '@/db/schema';
import { route, notFound } from '@/lib/http';
import { zTime } from '@/lib/crud';

export const PATCH = route({ body: z.object({ name: z.string().trim().min(1).max(60).optional(), category: z.string().max(30).optional(), reminderAt: zTime.nullable().optional(), archived: z.boolean().optional() }) }, async ({ user, params, body }) => {
  const { archived, ...rest } = body;
  const [r] = await db.update(habits).set({ ...rest, ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}) }).where(and(eq(habits.id, params.id), eq(habits.userId, user.id))).returning();
  if (!r) throw notFound();
  return r;
});
export const DELETE = route({}, async ({ user, params }) => {
  const r = await db.delete(habits).where(and(eq(habits.id, params.id), eq(habits.userId, user.id))).returning();
  if (!r.length) throw notFound();
  return { ok: true };
});
