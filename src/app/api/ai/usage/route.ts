import { route } from '@/lib/http';
import { aiUsageToday } from '@/lib/aitools';
import { currentPlan, PLANS } from '@/lib/plans';
import { configured, env } from '@/lib/env';

export const GET = route({}, async ({ user }) => {
  const { plan } = await currentPlan(user.id);
  return { plan, usedLast24h: await aiUsageToday(user.id), limit: PLANS[plan].limits.aiPerDay, provider: env.aiProvider, available: configured.ai() || env.sandbox, sandbox: !configured.ai() && env.sandbox };
});
