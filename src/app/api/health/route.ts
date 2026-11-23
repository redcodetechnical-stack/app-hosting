import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { route } from '@/lib/http';
import { redisPing } from '@/lib/ratelimit';

export const GET = route({ auth: false }, async () => {
  const t = Date.now();
  let dbOk = true;
  try { await db.execute(sql`select 1`); } catch { dbOk = false; }
  const body = { status: dbOk ? 'ok' : 'degraded', db: dbOk ? 'ok' : 'down', dbLatencyMs: Date.now() - t, redis: await redisPing(), time: new Date().toISOString(), version: process.env.npm_package_version ?? '1.0.0' };
  return Response.json(body, { status: dbOk ? 200 : 503 });
});
