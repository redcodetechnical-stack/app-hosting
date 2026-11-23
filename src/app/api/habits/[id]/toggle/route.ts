import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { habitCompletions, habits } from '@/db/schema';
import { route, notFound, badRequest } from '@/lib/http';
import { zDay } from '@/lib/crud';
import { getProfile, today } from '@/lib/wellness';

/** Marks the habit done for a day (default today), or undoes it if already done. */
export const POST = route({ body: z.object({ date: zDay.optional(), done: z.boolean().optional() }) }, async ({ user, params, body }) => {
  const [h] = await db.select().from(habits).where(and(eq(habits.id, params.id), eq(habits.userId, user.id)));
  if (!h) throw notFound();
  const t = today((await getProfile(user.id)).timezone);
  const d = body.date ?? t;
  if (d > t) throw badRequest('Cannot complete a habit in the future');
  const [ex] = await db.select().from(habitCompletions).where(and(eq(habitCompletions.habitId, h.id), eq(habitCompletions.date, d)));
  const want = body.done ?? !ex;
  if (want && !ex) await db.insert(habitCompletions).values({ habitId: h.id, userId: user.id, date: d });
  if (!want && ex) await db.delete(habitCompletions).where(eq(habitCompletions.id, ex.id));
  return { habitId: h.id, date: d, done: want };
});
