import { route } from '@/lib/http';
import { PLANS } from '@/lib/plans';
import { configured, env } from '@/lib/env';

export const GET = route({ auth: false }, async () => ({
  currency: 'INR', trialDays: env.trialDays, paymentsEnabled: configured.payments(), provider: env.paymentProvider,
  plans: Object.values(PLANS).map((p) => ({ ...p, limits: { ...p.limits, habits: Number.isFinite(p.limits.habits) ? p.limits.habits : null } })),
}));
