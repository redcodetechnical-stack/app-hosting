import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { subscriptions } from '@/db/schema';
import { ApiError } from './http';

export const PLANS = {
  FREE: { code: 'FREE', name: 'Free', pricePaise: 0, interval: 'month', features: ['Activity and step tracking', 'Water tracking and reminders', 'Up to 5 habits', 'Limited AI coach (5 messages a day)', 'Weekly insights'], limits: { habits: 5, aiPerDay: 5, familyProfiles: 0 } },
  PREMIUM: { code: 'PREMIUM', name: 'Premium', pricePaise: 29900, interval: 'month', features: ['Unlimited AI coach and AI health tools', 'Advanced sleep and nutrition analytics', 'Unlimited habits', 'Premium meditation library', 'Personalised programs'], limits: { habits: Infinity, aiPerDay: 200, familyProfiles: 0 } },
  FAMILY: { code: 'FAMILY', name: 'Family', pricePaise: 49900, interval: 'month', features: ['Everything in Premium', 'Up to 5 family profiles', 'Shared goals and family challenges', 'Family activity insights'], limits: { habits: Infinity, aiPerDay: 200, familyProfiles: 5 } },
} as const;
export type Plan = keyof typeof PLANS;

export async function currentPlan(userId: string): Promise<{ plan: Plan; subscription: typeof subscriptions.$inferSelect | null }> {
  const [s] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ['ACTIVE', 'TRIALING', 'PAST_DUE'])))
    .orderBy(desc(subscriptions.createdAt)).limit(1);
  if (!s) return { plan: 'FREE', subscription: null };
  const end = s.status === 'TRIALING' ? s.trialEndsAt : s.currentPeriodEnd;
  if (end && end < new Date()) {
    await db.update(subscriptions).set({ status: 'EXPIRED' }).where(eq(subscriptions.id, s.id));
    return { plan: 'FREE', subscription: null };
  }
  return { plan: s.plan as Plan, subscription: s };
}

export async function requirePlan(userId: string, ...allowed: Plan[]) {
  const { plan } = await currentPlan(userId);
  if (!allowed.includes(plan)) throw new ApiError(402, 'upgrade_required', `This feature needs the ${allowed.join(' or ')} plan.`);
  return plan;
}
