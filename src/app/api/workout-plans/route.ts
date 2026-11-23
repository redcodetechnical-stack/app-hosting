import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { workoutPlans } from '@/db/schema';
import { route } from '@/lib/http';

export const GET = route({}, async ({ user }) => ({ items: await db.select().from(workoutPlans).where(eq(workoutPlans.userId, user.id)).orderBy(asc(workoutPlans.weekday)) }));
export const PUT = route({ body: z.object({ weekday: z.number().int().min(0).max(6), type: z.enum(['WALK', 'RUN', 'CYCLE', 'STRENGTH', 'YOGA', 'HIIT', 'CARDIO', 'SWIM', 'OTHER']), minutes: z.number().int().min(5).max(300) }) }, async ({ user, body }) => {
  const [r] = await db.insert(workoutPlans).values({ userId: user.id, ...body }).onConflictDoUpdate({ target: [workoutPlans.userId, workoutPlans.weekday], set: { type: body.type, minutes: body.minutes } }).returning();
  return r;
});
export const DELETE = route({}, async ({ user, query }) => {
  const wd = Number(query.get('weekday'));
  await db.delete(workoutPlans).where(and(eq(workoutPlans.userId, user.id), eq(workoutPlans.weekday, wd)));
  return { ok: true };
});
