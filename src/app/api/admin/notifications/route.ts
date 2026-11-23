import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { notifications, users } from '@/db/schema';
import { route } from '@/lib/http';
import { audit } from '@/lib/audit';

/** In-app broadcast to all active users, or one plan's users. */
export const POST = route({ perm: 'notifications.broadcast', body: z.object({ title: z.string().min(2).max(80), body: z.string().min(2).max(300), plan: z.enum(['ALL', 'FREE', 'PREMIUM', 'FAMILY']).default('ALL') }), rate: [5, 3600] }, async ({ user, body, ip }) => {
  const filter = body.plan === 'ALL' ? sql`true` : body.plan === 'FREE'
    ? sql`not exists (select 1 from subscriptions s where s.user_id = ${users.id} and s.status in ('ACTIVE','TRIALING'))`
    : sql`exists (select 1 from subscriptions s where s.user_id = ${users.id} and s.status in ('ACTIVE','TRIALING') and s.plan = ${body.plan})`;
  const targets = await db.select({ id: users.id }).from(users).where(sql`${users.status} = 'ACTIVE' and ${filter}`);
  for (let i = 0; i < targets.length; i += 500)
    await db.insert(notifications).values(targets.slice(i, i + 500).map((t) => ({ userId: t.id, type: 'SYSTEM' as const, title: body.title, body: body.body, sentAt: new Date() })));
  await audit(user.id, 'admin.broadcast', null, { plan: body.plan, recipients: targets.length }, ip);
  return { ok: true, recipients: targets.length };
});

