import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { adminRoles, profiles, users } from '@/db/schema';
import { route, paging } from '@/lib/http';

/** ?q=email/phone/name &status= &role= &plan=FREE|PREMIUM|FAMILY */
export const GET = route({ perm: 'users.read' }, async ({ query }) => {
  const { limit, offset, page } = paging(query, 100);
  const c: SQL[] = [];
  const q = query.get('q')?.trim();
  if (q) c.push(or(ilike(users.email, `%${q}%`), ilike(users.phone, `%${q}%`), ilike(profiles.name, `%${q}%`))!);
  if (query.get('status')) c.push(eq(users.status, query.get('status') as never));
  if (query.get('role')) c.push(eq(adminRoles.key, query.get('role')!));
  const plan = query.get('plan');
  if (plan === 'FREE') c.push(sql`not exists (select 1 from subscriptions s where s.user_id = ${users.id} and s.status in ('ACTIVE','TRIALING','PAST_DUE'))`);
  else if (plan) c.push(sql`exists (select 1 from subscriptions s where s.user_id = ${users.id} and s.status in ('ACTIVE','TRIALING','PAST_DUE') and s.plan = ${plan})`);
  const rows = await db.select({ id: users.id, email: users.email, phone: users.phone, status: users.status, role: adminRoles.key, name: profiles.name, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt,
      plan: sql<string>`coalesce((select s.plan from subscriptions s where s.user_id = ${users.id} and s.status in ('ACTIVE','TRIALING','PAST_DUE') order by s.created_at desc limit 1), 'FREE')` })
    .from(users).innerJoin(adminRoles, eq(adminRoles.id, users.roleId)).leftJoin(profiles, eq(profiles.userId, users.id))
    .where(c.length ? and(...c) : undefined).orderBy(desc(users.createdAt)).limit(limit).offset(offset);
  const [{ total }] = (await db.select({ total: sql<number>`count(*)::int` }).from(users).innerJoin(adminRoles, eq(adminRoles.id, users.roleId)).leftJoin(profiles, eq(profiles.userId, users.id)).where(c.length ? and(...c) : undefined));
  return { items: rows, page, limit, total };
});
