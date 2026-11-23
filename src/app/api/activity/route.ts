import { z } from 'zod';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { activityLogs } from '@/db/schema';
import { route } from '@/lib/http';
import { zDay } from '@/lib/crud';
import { getProfile, today } from '@/lib/wellness';
import { isDay } from '@/lib/dates';

export const GET = route({}, async ({ user, query }) => {
  const conds = [eq(activityLogs.userId, user.id)];
  const from = query.get('from'), to = query.get('to');
  if (isDay(from)) conds.push(gte(activityLogs.date, from));
  if (isDay(to)) conds.push(lte(activityLogs.date, to));
  return { items: await db.select().from(activityLogs).where(and(...conds)).orderBy(desc(activityLogs.date)).limit(400) };
});

/** Manual steps. mode=add increments the day's manual total; mode=set replaces it. Device rows are kept separately. */
export const POST = route({ body: z.object({ steps: z.number().int().min(0).max(100000), date: zDay.optional(), distanceKm: z.number().min(0).max(200).optional(), mode: z.enum(['add', 'set']).default('add') }), rate: [120, 60] }, async ({ user, body }) => {
  const date = body.date ?? today((await getProfile(user.id)).timezone);
  const [r] = await db.insert(activityLogs).values({ userId: user.id, date, steps: body.steps, distanceKm: body.distanceKm ?? null, source: 'MANUAL' })
    .onConflictDoUpdate({ target: [activityLogs.userId, activityLogs.date, activityLogs.source], set: { steps: body.mode === 'add' ? sql`${activityLogs.steps} + ${body.steps}` : body.steps, distanceKm: body.distanceKm ?? null } })
    .returning();
  return r;
});
