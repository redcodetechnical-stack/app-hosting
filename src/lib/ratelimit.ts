import Redis from 'ioredis';
import { env } from './env';

let redis: Redis | null = null;
if (env.redisUrl) {
  redis = new Redis(env.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true, enableOfflineQueue: false });
  redis.on('error', () => {});
}
const mem = new Map<string, { n: number; reset: number }>();

/** Fixed-window limiter: Redis when REDIS_URL is set (multi-instance safe), memory otherwise. */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<{ ok: boolean; retryAfter: number }> {
  if (redis) {
    try {
      if (redis.status === 'wait') await redis.connect();
      const k = `rl:${key}`;
      const n = await redis.incr(k);
      if (n === 1) await redis.expire(k, windowSec);
      const ttl = await redis.ttl(k);
      return { ok: n <= max, retryAfter: Math.max(1, ttl) };
    } catch { /* fall back to memory */ }
  }
  const now = Date.now();
  const e = mem.get(key);
  if (!e || e.reset < now) { mem.set(key, { n: 1, reset: now + windowSec * 1000 }); return { ok: true, retryAfter: windowSec }; }
  e.n++;
  if (mem.size > 50_000) for (const [k, v] of mem) if (v.reset < now) mem.delete(k);
  return { ok: e.n <= max, retryAfter: Math.ceil((e.reset - now) / 1000) };
}

export async function redisPing(): Promise<'ok' | 'down' | 'not_configured'> {
  if (!redis) return 'not_configured';
  try { if (redis.status === 'wait') await redis.connect(); return (await redis.ping()) === 'PONG' ? 'ok' : 'down'; } catch { return 'down'; }
}
