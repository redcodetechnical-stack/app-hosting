import { z } from 'zod';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { adminRoles, auditLogs, profiles, sessions, subscriptions, users } from '@/db/schema';
import { route, notFound, forbidden, badRequest } from '@/lib/http';
import { audit } from '@/lib/audit';
import { clearPermCache } from '@/lib/auth';

/** Account overview for support. Deliberately excludes health logs, journal and AI chats (privacy by design); only activity counts. */
export const GET = route({ perm: 'users.read' }, async ({ params }) => {
  const [u] = await db.select({ id: users.id, email: users.email, phone: users.phone, status: users.status, suspendedReason: users.suspendedReason, role: adminRoles.key, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt, emailVerifiedAt: users.emailVerifiedAt })
    .from(users).innerJoin(adminRoles, eq(adminRoles.id, users.roleId)).where(eq(users.id, params.id));
  if (!u) throw notFound();
  const [p] = await db.select({ name: profiles.name, timezone: profiles.timezone, language: profiles.language, onboardedAt: profiles.onboardedAt }).from(profiles).where(eq(profiles.userId, u.id));
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, u.id)).orderBy(desc(subscriptions.createdAt));
  const activity = (await db.execute(sql`select (select count(*) from water_logs where user_id=${u.id} and logged_at>now()-interval '30 days')::int water_30d, (select count(*) from workouts where user_id=${u.id} and started_at>now()-interval '30 days')::int workouts_30d, (select count(*) from mood_logs where user_id=${u.id} and logged_at>now()-interval '30 days')::int moods_30d, (select count(*) from sessions where user_id=${u.id} and revoked_at is null and expires_at>now())::int active_sessions`)).rows[0];
  const recent = await db.select().from(auditLogs).where(eq(auditLogs.actorId, u.id)).orderBy(desc(auditLogs.createdAt)).limit(20);
  return { ...u, profile: p ?? null, subscriptions: subs, activity, recentAuditEvents: recent };
});

export const PATCH = route({ perm: 'users.manage', body: z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']).optional(), reason: z.string().max(300).optional(), role: z.enum(['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER', 'SUPPORT_AGENT', 'PROFESSIONAL', 'USER']).optional(), revokeSessions: z.boolean().optional() }) }, async ({ user, params, body, ip }) => {
  if (params.id === user.id && (body.status === 'SUSPENDED' || body.role)) throw badRequest('You cannot change your own status or role');
  const [target] = await db.select({ u: users, role: adminRoles.key }).from(users).innerJoin(adminRoles, eq(adminRoles.id, users.roleId)).where(eq(users.id, params.id));
  if (!target || target.u.status === 'DELETED') throw notFound();
  if (target.role === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') throw forbidden('Only a super admin can change another super admin');
  const set: Record<string, unknown> = {};
  if (body.status) { set.status = body.status; set.suspendedReason = body.status === 'SUSPENDED' ? body.reason ?? 'Suspended by admin' : null; }
  if (body.role) {
    if (!user.permissions.has('roles.manage')) throw forbidden('Changing roles needs roles.manage');
    const [r] = await db.select().from(adminRoles).where(eq(adminRoles.key, body.role));
    set.roleId = r.id; clearPermCache();
  }
  const [u] = await db.update(users).set(set).where(eq(users.id, params.id)).returning({ id: users.id, status: users.status });
  if (body.status === 'SUSPENDED' || body.revokeSessions) await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, params.id));
  await audit(user.id, body.role ? 'admin.user_role' : 'admin.user_status', { type: 'user', id: params.id }, { ...body }, ip);
  return u;
});
