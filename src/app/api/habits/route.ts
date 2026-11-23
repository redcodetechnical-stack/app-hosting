import { z } from 'zod';
import { and, asc, count, eq, gte, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { habitCompletions, habits } from '@/db/schema';
import { route, ApiError } from '@/lib/http';
import { currentPlan, PLANS } from '@/lib/plans';
import { getProfile, lastNDays } from '@/lib/wellness';
import { zTime } from '@/lib/crud';

function streakOf(dates: Set<string>, days: string[]) {
  let n = 0, i = days.length - 1;
  if (!dates.has(days[i])) i--;
  for (; i >= 0 && dates.has(days[i]); i--) n++;
  return n;
}

export const GET = route({}, async ({ user }) => {
  const tz = (await getProfile(user.id)).timezone;
  const days = lastNDays(90, tz);
  const hs = await db.select().from(habits).where(and(eq(habits.userId, user.id), isNull(habits.archivedAt))).orderBy(asc(habits.createdAt));
  const comps = await db.select().from(habitCompletions).where(and(eq(habitCompletions.userId, user.id), gte(habitCompletions.date, days[0])));
  return {
    today: days[days.length - 1],
    items: hs.map((h) => {
      const ds = new Set(comps.filter((c) => c.habitId === h.id).map((c) => String(c.date)));
      return { ...h, doneToday: ds.has(days[days.length - 1]), streak: streakOf(ds, days), last28: days.slice(-28).map((d) => ({ date: d, done: ds.has(d) })) };
    }),
  };
});

export const POST = route({ body: z.object({ name: z.string().trim().min(1).max(60), category: z.enum(['Fitness', 'Nutrition', 'Sleep', 'Mind', 'Hydration', 'Productivity', 'Other']).default('Other'), reminderAt: zTime.optional() }) }, async ({ user, body }) => {
  const { plan } = await currentPlan(user.id);
  const [{ n }] = await db.select({ n: count() }).from(habits).where(and(eq(habits.userId, user.id), isNull(habits.archivedAt)));
  if (n >= PLANS[plan].limits.habits) throw new ApiError(402, 'upgrade_required', `The ${PLANS[plan].name} plan includes up to ${PLANS[plan].limits.habits} habits. Upgrade for unlimited habits.`);
  const [h] = await db.insert(habits).values({ userId: user.id, ...body }).returning();
  return Response.json(h, { status: 201 });
});
