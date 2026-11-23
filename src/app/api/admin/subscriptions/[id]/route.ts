import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { subscriptions } from '@/db/schema';
import { route, notFound } from '@/lib/http';
import { audit } from '@/lib/audit';
import { zIso } from '@/lib/crud';

export const PATCH = route({ perm: 'subscriptions.manage', body: z.object({ status: z.enum(['ACTIVE', 'CANCELLED', 'EXPIRED', 'PAST_DUE']).optional(), currentPeriodEnd: zIso.optional(), plan: z.enum(['PREMIUM', 'FAMILY']).optional() }) }, async ({ user, params, body, ip }) => {
  const [s] = await db.update(subscriptions).set({ ...body, ...(body.status === 'CANCELLED' ? { cancelledAt: new Date() } : {}) }).where(eq(subscriptions.id, params.id)).returning();
  if (!s) throw notFound();
  await audit(user.id, 'admin.subscription_update', { type: 'subscription', id: s.id }, body, ip);
  return s;
});
