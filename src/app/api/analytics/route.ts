import { route, badRequest } from '@/lib/http';
import { dayStats, getProfile, lastNDays, wellnessScore } from '@/lib/wellness';

const METRICS = ['steps', 'waterMl', 'kcalIn', 'protein', 'activeMin', 'sleepH', 'mood', 'stress', 'meditationMin', 'score', 'burnedKcalEst'] as const;

/** Time series for charts: ?metric=steps&days=7|30|90 (weekly + monthly analytics). */
export const GET = route({}, async ({ user, query }) => {
  const metric = (query.get('metric') ?? 'score') as (typeof METRICS)[number];
  if (!METRICS.includes(metric)) throw badRequest(`metric must be one of ${METRICS.join(', ')}`);
  const n = Math.min(365, Math.max(1, Number(query.get('days') ?? 7)));
  const p = await getProfile(user.id);
  const days = lastNDays(n, p.timezone);
  const st = await dayStats(user.id, p.timezone, days);
  const g = { stepGoal: p.stepGoal, waterGoalMl: p.waterGoalMl, sleepGoalH: p.sleepGoalH };
  const series = days.map((d) => ({ date: d, value: metric === 'score' ? wellnessScore(st[d], g).score : (st[d] as Record<string, number | null | string>)[metric] as number | null }));
  const vals = series.map((x) => x.value).filter((v): v is number => v != null && v !== 0);
  const goal = { steps: p.stepGoal, waterMl: p.waterGoalMl, kcalIn: p.calorieGoal, sleepH: p.sleepGoalH, activeMin: 30 }[metric as string] ?? null;
  return { metric, days: n, goal, series, summary: { average: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null, best: vals.length ? Math.max(...vals) : null, daysLogged: vals.length, daysOnGoal: goal ? series.filter((x) => (x.value ?? 0) >= goal).length : null } };
});
