import { z } from 'zod';
import { db } from '@/db';
import { activityLogs, healthMetrics, integrations, sleepLogs } from '@/db/schema';
import { route, ApiError } from '@/lib/http';
import { zDay, zIso } from '@/lib/crud';
import { findIntegration } from '@/lib/integrations';
import { METRIC_RANGE, METRIC_UNITS } from '@/lib/wellness';

/** Apple HealthKit / Health Connect: the native app reads data on-device (with OS permission) and posts batches here. */
const Body = z.object({
  steps: z.array(z.object({ date: zDay, steps: z.number().int().min(0).max(150000), distanceKm: z.number().min(0).max(300).optional() })).max(400).default([]),
  sleep: z.array(z.object({ wakeDate: zDay, bedtime: zIso, wakeTime: zIso, quality: z.number().int().min(1).max(5).default(3), stages: z.record(z.number()).optional() })).max(400).default([]),
  metrics: z.array(z.object({ kind: z.enum(['WEIGHT', 'HEART_RATE', 'RESTING_HEART_RATE', 'BLOOD_PRESSURE', 'SPO2', 'BODY_TEMPERATURE', 'BLOOD_GLUCOSE', 'BODY_FAT']), value: z.number(), value2: z.number().optional(), measuredAt: zIso })).max(2000).default([]),
});

export const POST = route({ body: Body, rate: [30, 600] }, async ({ user, params, body }) => {
  const p = params.provider.toUpperCase();
  if (p !== 'APPLE_HEALTH' && p !== 'HEALTH_CONNECT') throw new ApiError(400, 'bad_provider', 'Only APPLE_HEALTH and HEALTH_CONNECT accept device uploads');
  const row = await findIntegration(user.id, p);
  if (!row || row.status !== 'CONNECTED') throw new ApiError(409, 'not_connected', 'Connect this source (with consent) before uploading');
  for (const s of body.steps)
    await db.insert(activityLogs).values({ userId: user.id, date: s.date, steps: s.steps, distanceKm: s.distanceKm ?? null, source: 'DEVICE' })
      .onConflictDoUpdate({ target: [activityLogs.userId, activityLogs.date, activityLogs.source], set: { steps: s.steps, distanceKm: s.distanceKm ?? null } });
  for (const s of body.sleep)
    await db.insert(sleepLogs).values({ userId: user.id, wakeDate: s.wakeDate, bedtime: s.bedtime, wakeTime: s.wakeTime, quality: s.quality, stages: s.stages ?? null, source: 'DEVICE' })
      .onConflictDoUpdate({ target: [sleepLogs.userId, sleepLogs.wakeDate, sleepLogs.source], set: { bedtime: s.bedtime, wakeTime: s.wakeTime, stages: s.stages ?? null } });
  const ms = body.metrics.filter((m) => m.value >= METRIC_RANGE[m.kind][0] && m.value <= METRIC_RANGE[m.kind][1]);
  if (ms.length) await db.insert(healthMetrics).values(ms.map((m) => ({ userId: user.id, kind: m.kind, value: m.value, value2: m.value2 ?? null, unit: METRIC_UNITS[m.kind], source: 'DEVICE' as const, deviceId: p.toLowerCase(), measuredAt: m.measuredAt })));
  const { eq } = await import('drizzle-orm');
  await db.update(integrations).set({ lastSyncAt: new Date(), lastError: null }).where(eq(integrations.id, row.id));
  return { ok: true, imported: { steps: body.steps.length, sleep: body.sleep.length, metrics: ms.length, rejectedOutOfRange: body.metrics.length - ms.length } };
});
