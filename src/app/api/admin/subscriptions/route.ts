import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { subscriptions, users } from '@/db/schema';
import { route, paging, notFound } from '@/lib/http';
import { audit } from '@/lib/audit';

export const GET = route({ perm: 'subscriptions.manage' }, async ({ query }) => {
  const { limit, offset, page } = paging(query, 200);
  const st = query.get('status');
  const rows = await db.select({ s: subscriptions, email: users.email }).from(subscriptions).innerJoin(users, eq(users.id, subscriptions.userId)).where(st ? eq(subscriptions.status, st as never) : undefined).orderBy(desc(subscriptions.createdAt)).limit(limit).offset(offset);
  return { items: rows.map((r) => ({ ...r.s, email: r.email })), page, limit };
});
/** Grant a complimentary plan (e.g. partners, support goodwill). Ends any current one. */
export const POST = route({ perm: 'subscriptions.manage', body: z.object({ userId: z.string(), plan: z.enum(['PREMIUM', 'FAMILY']), days: z.number().int().min(1).max(366) }) }, async ({ user, body, ip }) => {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, body.userId));
  if (!u) throw notFound('User not found');
  await db.update(subscriptions).set({ status: 'CANCELLED', cancelledAt: new Date() }).where(and(eq(subscriptions.userId, body.userId), inArray(subscriptions.status, ['ACTIVE', 'TRIALING', 'PAST_DUE'])));
  const [s] = await db.insert(subscriptions).values({ userId: body.userId, plan: body.plan, status: 'ACTIVE', provider: 'complimentary', currentPeriodEnd: new Date(Date.now() + body.days * 864e5) }).returning();
  await audit(user.id, 'admin.subscription_grant', { type: 'subscription', id: s.id }, body, ip);
  return Response.json(s, { status: 201 });
});
