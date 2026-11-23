import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { subscriptions } from '@/db/schema';
import { route, ApiError, conflict } from '@/lib/http';
import { currentPlan } from '@/lib/plans';
import { env } from '@/lib/env';
import { audit } from '@/lib/audit';

/** One free trial per account, no payment method needed. */
export const POST = route({ body: z.object({ plan: z.enum(['PREMIUM', 'FAMILY']) }), rate: [5, 3600] }, async ({ user, body, ip }) => {
  if (env.trialDays <= 0) throw new ApiError(400, 'trial_disabled', 'Free trials are not offered right now');
  const prior = await db.select({ id: subscriptions.id }).from(subscriptions).where(and(eq(subscriptions.userId, user.id), eq(subscriptions.status, 'TRIALING')));
  const any = await db.select({ t: subscriptions.trialEndsAt }).from(subscriptions).where(eq(subscriptions.userId, user.id));
  if (prior.length || any.some((r) => r.t)) throw conflict('You have already used your free trial');
  if ((await currentPlan(user.id)).plan !== 'FREE') throw conflict('You already have a paid plan');
  const ends = new Date(Date.now() + env.trialDays * 864e5);
  const [s] = await db.insert(subscriptions).values({ userId: user.id, plan: body.plan, status: 'TRIALING', trialEndsAt: ends }).returning();
  await audit(user.id, 'billing.trial_start', { type: 'subscription', id: s.id }, { plan: body.plan }, ip);
  return Response.json(s, { status: 201 });
});
