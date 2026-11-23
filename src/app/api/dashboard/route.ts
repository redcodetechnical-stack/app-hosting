import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { healthMetrics, workoutPlans } from '@/db/schema';
import { route } from '@/lib/http';
import { isDay, weekday } from '@/lib/dates';
import { addDays, dayStats, getProfile, insightsFrom, lastNDays, today, wellnessScore } from '@/lib/wellness';

/** Everything the home dashboard needs, computed from the user's own logs. No stored or hard-coded values. */
export const GET = route({}, async ({ user, query }) => {
  const p = await getProfile(user.id);
  const d = isDay(query.get('date')) ? query.get('date')! : today(p.timezone);
  const days = lastNDays(14, p.timezone, d);
  const st = await dayStats(user.id, p.timezone, days);
  const s = st[d];
  const goals = { stepGoal: p.stepGoal, waterGoalMl: p.waterGoalMl, sleepGoalH: p.sleepGoalH };
  const score = wellnessScore(s, goals);
  const yesterday = wellnessScore(st[addDays(d, -1)], goals);
  const [hr] = await db.select().from(healthMetrics).where(and(eq(healthMetrics.userId, user.id), inArray(healthMetrics.kind, ['RESTING_HEART_RATE', 'HEART_RATE']))).orderBy(desc(healthMetrics.measuredAt)).limit(1);
  const [plan] = await db.select().from(workoutPlans).where(and(eq(workoutPlans.userId, user.id), eq(workoutPlans.weekday, weekday(d))));
  const week = days.slice(-7).map((x) => ({ ...st[x], score: wellnessScore(st[x], goals).score }));
  return {
    date: d,
    score: { ...score, changeVsYesterday: score.score != null && yesterday.score != null ? Math.round((score.score - yesterday.score) * 10) / 10 : null },
    activity: { steps: s.steps, stepGoal: p.stepGoal, activeMin: s.activeMin, activeGoal: 30, burnedKcal: s.burnedKcalEst, burnedSource: 'ESTIMATED' },
    water: { ml: s.waterMl, goal: p.waterGoalMl },
    nutrition: { calories: s.kcalIn, goal: p.calorieGoal, protein: s.protein, carbs: s.carbs, fat: s.fat },
    sleep: s.sleepH == null ? null : { hours: s.sleepH, quality: s.sleepQuality, goal: p.sleepGoalH },
    mood: s.mood == null ? null : { mood: s.mood, stress: s.stress },
    habits: { done: s.habitsDone, total: s.habitsTotal },
    meditation: { minutes: s.meditationMin },
    heartRate: hr ? { value: hr.value, kind: hr.kind, source: hr.source, measuredAt: hr.measuredAt } : null,
    plannedWorkout: plan ?? null,
    week,
    insights: insightsFrom(days.map((x) => st[x]), goals),
  };
});
