import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { achievements, challenges, userAchievements } from '@/db/schema';
import { dayStats, getProfile, lastNDays, streak, wellnessScore } from './wellness';
import { localDate } from './dates';

export async function challengeProgress(userId: string, c: typeof challenges.$inferSelect) {
  const tz = (await getProfile(userId)).timezone;
  const start = localDate(c.startsAt, tz), end = localDate(new Date(Math.min(Date.now(), c.endsAt.getTime())), tz);
  const days: string[] = [];
  for (let d = start; d <= end && days.length < 120; d = new Date(new Date(`${d}T12:00:00Z`).getTime() + 864e5).toISOString().slice(0, 10)) days.push(d);
  if (!days.length) return 0;
  const st = Object.values(await dayStats(userId, tz, days));
  const p = await getProfile(userId);
  switch (c.metric) {
    case 'STEPS': return st.reduce((a, s) => a + s.steps, 0);
    case 'WATER_ML': return st.reduce((a, s) => a + s.waterMl, 0);
    case 'ACTIVE_MINUTES': return st.reduce((a, s) => a + s.activeMin, 0);
    case 'MEDITATION_MINUTES': return st.reduce((a, s) => a + s.meditationMin, 0);
    case 'SLEEP_NIGHTS': return st.filter((s) => s.sleepH != null && s.sleepH >= p.sleepGoalH - 0.5).length;
    case 'HABIT_COMPLETIONS': return st.reduce((a, s) => a + s.habitsDone, 0);
  }
}

/** Weekly points: transparent formula over this week's logs. */
export async function weeklyPoints(userId: string) {
  const p = await getProfile(userId);
  const st = Object.values(await dayStats(userId, p.timezone, lastNDays(7, p.timezone)));
  return st.reduce((a, s) => a + (s.waterMl >= p.waterGoalMl ? 10 : s.waterMl ? 3 : 0) + (s.steps >= p.stepGoal ? 10 : s.steps ? 3 : 0) + Math.min(30, s.activeMin) / 3 + (s.sleepH != null ? 5 : 0) + (s.mood != null ? 3 : 0) + s.habitsDone * 2 + Math.min(20, s.meditationMin) / 2, 0) | 0;
}

/** Rules for each achievement key; awards any newly met ones and returns the full list. */
export async function evaluateAchievements(userId: string) {
  const p = await getProfile(userId);
  const st = Object.values(await dayStats(userId, p.timezone, lastNDays(60, p.timezone)));
  const g = { stepGoal: p.stepGoal, waterGoalMl: p.waterGoalMl, sleepGoalH: p.sleepGoalH };
  const logged = st.filter((s) => s.waterMl || s.steps || s.kcalIn || s.activeMin || s.sleepH != null || s.mood != null);
  const [{ w }] = (await db.execute(sql`select count(*)::int w from workouts where user_id=${userId}`)).rows as { w: number }[];
  const [{ j }] = (await db.execute(sql`select count(*)::int j from journal_entries where user_id=${userId}`)).rows as { j: number }[];
  const rules: Record<string, boolean> = {
    first_log: logged.length > 0,
    week_one: logged.length >= 7,
    hydrated_3: (await streak(userId, p.timezone, (s) => s.waterMl >= p.waterGoalMl)) >= 3,
    steps_goal_7: (await streak(userId, p.timezone, (s) => s.steps >= p.stepGoal)) >= 7,
    ten_workouts: w >= 10,
    journal_keeper: j >= 5,
    calm_mind: st.reduce((a, s) => a + s.meditationMin, 0) >= 60,
    score_8: st.some((s) => (wellnessScore(s, g).score ?? 0) >= 8),
  };
  const all = await db.select().from(achievements);
  const mine = new Set((await db.select().from(userAchievements).where(eq(userAchievements.userId, userId))).map((x) => x.achievementId));
  const fresh = all.filter((a) => rules[a.key] && !mine.has(a.id));
  if (fresh.length) await db.insert(userAchievements).values(fresh.map((a) => ({ userId, achievementId: a.id }))).onConflictDoNothing();
  return { newlyEarned: fresh.map((a) => a.key), items: all.map((a) => ({ ...a, earned: mine.has(a.id) || fresh.some((f) => f.id === a.id) })) };
}

