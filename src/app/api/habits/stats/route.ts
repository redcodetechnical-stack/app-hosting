import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import { habitCompletions } from '@/db/schema';
import { route } from '@/lib/http';
import { dayStats, getProfile, lastNDays } from '@/lib/wellness';

/** Weekly and monthly completion reports. */
export const GET = route({}, async ({ user }) => {
  const tz = (await getProfile(user.id)).timezone;
  const d30 = lastNDays(30, tz);
  const st = await dayStats(user.id, tz, d30);
  const pct = (days: string[]) => { const done = days.reduce((a, d) => a + st[d].habitsDone, 0), tot = days.reduce((a, d) => a + st[d].habitsTotal, 0); return { done, possible: tot, percent: tot ? Math.round((done / tot) * 100) : 0 }; };
  const comps = await db.select().from(habitCompletions).where(and(eq(habitCompletions.userId, user.id), gte(habitCompletions.date, d30[0])));
  return { week: pct(d30.slice(-7)), month: pct(d30), calendar: d30.map((d) => ({ date: d, done: st[d].habitsDone, total: st[d].habitsTotal })), completions: comps.length };
});
