import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { subscriptions } from '@/db/schema';
import { route, notFound } from '@/lib/http';
import { currentPlan } from '@/lib/plans';
import { audit } from '@/lib/audit';

/** Cancels at period end (paid) or immediately (trial). Downgrade to Free happens automatically when the period ends. */
export const POST = route({}, async ({ user, ip }) => {
  const { subscription: s } = await currentPlan(user.id);
  if (!s) throw notFound('No active subscription');
  const immediate = s.status === 'TRIALING';
  const [r] = await db.update(subscriptions).set(immediate ? { status: 'CANCELLED', cancelledAt: new Date() } : { cancelAtPeriodEnd: true, cancelledAt: new Date() }).where(eq(subscriptions.id, s.id)).returning();
  await audit(user.id, 'billing.cancel', { type: 'subscription', id: s.id }, { immediate }, ip);
  return { ok: true, subscription: r, accessUntil: immediate ? new Date() : s.currentPeriodEnd };
});
