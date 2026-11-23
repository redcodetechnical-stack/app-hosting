import { sql } from 'drizzle-orm';
import { db, pool } from '@/db';
import { route } from '@/lib/http';
import { redisPing } from '@/lib/ratelimit';
import { env } from '@/lib/env';

export const GET = route({ perm: 'system.manage' }, async () => {
  const t = Date.now();
  await db.execute(sql`select 1`);
  const dbMs = Date.now() - t;
  const size = (await db.execute(sql`select pg_size_pretty(pg_database_size(current_database())) size`)).rows[0];
  const failedHooks = (await db.execute(sql`select count(*)::int n from webhook_events where error is not null and created_at > now()-interval '1 day'`)).rows[0];
  const pendingNotifs = (await db.execute(sql`select count(*)::int n from notifications where sent_at is null`)).rows[0];
  return { db: { ok: true, latencyMs: dbMs, size: size.size, pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } }, redis: await redisPing(), node: process.version, uptimeSec: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1048576), env: env.nodeEnv, sandbox: env.sandbox, failedWebhooks24h: failedHooks.n, pendingNotifications: pendingNotifs.n };
});
