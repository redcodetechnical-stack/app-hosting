import { route } from '@/lib/http';
import { dayStats, getProfile, insightsFrom, lastNDays } from '@/lib/wellness';

export const GET = route({}, async ({ user }) => {
  const p = await getProfile(user.id);
  const days = lastNDays(14, p.timezone);
  const st = await dayStats(user.id, p.timezone, days);
  return { items: insightsFrom(days.map((d) => st[d]), { waterGoalMl: p.waterGoalMl, sleepGoalH: p.sleepGoalH, stepGoal: p.stepGoal }), source: 'rules over your own logs' };
});
