import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { activityLogs, healthMetrics, integrations, sleepLogs } from '@/db/schema';
import { configured, env } from './env';
import { decrypt, encrypt } from './crypto';
import { withRetry } from './retry';
import { ApiError } from './http';
import { addDays, lastNDays } from './dates';

export type Provider = 'FITBIT' | 'OURA' | 'WHOOP' | 'GARMIN' | 'APPLE_HEALTH' | 'HEALTH_CONNECT';

export const PROVIDERS: Record<Provider, { name: string; kind: 'oauth2' | 'oauth1' | 'native'; data: string[]; configured: () => boolean; note: string;
  auth?: { authorize: string; token: string; scopes: string[]; clientId: () => string | undefined; clientSecret: () => string | undefined; basicAuth?: boolean } }> = {
  FITBIT: { name: 'Fitbit', kind: 'oauth2', data: ['steps', 'sleep', 'heart rate', 'weight'], configured: configured.fitbit, note: 'Fitbit Web API (OAuth 2.0 + PKCE).',
    auth: { authorize: 'https://www.fitbit.com/oauth2/authorize', token: 'https://api.fitbit.com/oauth2/token', scopes: ['activity', 'sleep', 'heartrate', 'weight', 'profile'], clientId: () => env.fitbitClientId, clientSecret: () => env.fitbitClientSecret, basicAuth: true } },
  OURA: { name: 'Oura', kind: 'oauth2', data: ['sleep', 'readiness', 'heart rate', 'steps'], configured: configured.oura, note: 'Oura API v2.',
    auth: { authorize: 'https://cloud.ouraring.com/oauth/authorize', token: 'https://api.ouraring.com/oauth/token', scopes: ['daily', 'heartrate', 'personal'], clientId: () => env.ouraClientId, clientSecret: () => env.ouraClientSecret } },
  WHOOP: { name: 'WHOOP', kind: 'oauth2', data: ['sleep', 'recovery', 'workouts'], configured: configured.whoop, note: 'WHOOP Developer API v1.',
    auth: { authorize: 'https://api.prod.whoop.com/oauth/oauth2/auth', token: 'https://api.prod.whoop.com/oauth/oauth2/token', scopes: ['read:sleep', 'read:recovery', 'read:workout', 'offline'], clientId: () => env.whoopClientId, clientSecret: () => env.whoopClientSecret } },
  GARMIN: { name: 'Garmin', kind: 'oauth1', data: ['steps', 'sleep', 'heart rate'], configured: configured.garmin, note: 'Garmin Health API is partner-approved and push-based (webhooks); approval required before connecting.' },
  APPLE_HEALTH: { name: 'Apple Health', kind: 'native', data: ['steps', 'sleep', 'heart rate', 'weight'], configured: () => !!env.healthIngestKey, note: 'Read on-device by the iOS app (HealthKit) and sent to /api/integrations/APPLE_HEALTH/ingest.' },
  HEALTH_CONNECT: { name: 'Health Connect', kind: 'native', data: ['steps', 'sleep', 'heart rate', 'weight'], configured: () => !!env.healthIngestKey, note: 'Read on-device by the Android app (Health Connect) and sent to /api/integrations/HEALTH_CONNECT/ingest.' },
};

export const redirectUri = (p: Provider) => `${env.appUrl}/api/integrations/${p}/callback`;

export function authorizeUrl(p: Provider, state: string, codeChallenge: string) {
  const a = PROVIDERS[p].auth!;
  const u = new URL(a.authorize);
  u.search = new URLSearchParams({ response_type: 'code', client_id: a.clientId()!, redirect_uri: redirectUri(p), scope: a.scopes.join(' '), state, code_challenge: codeChallenge, code_challenge_method: 'S256' }).toString();
  return u.toString();
}

export async function exchangeCode(p: Provider, code: string, verifier: string) {
  return tokenRequest(p, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(p), code_verifier: verifier });
}

async function tokenRequest(p: Provider, params: Record<string, string>) {
  const a = PROVIDERS[p].auth!;
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const body = new URLSearchParams(params);
  if (a.basicAuth) headers.Authorization = 'Basic ' + Buffer.from(`${a.clientId()}:${a.clientSecret()}`).toString('base64');
  else { body.set('client_id', a.clientId()!); body.set('client_secret', a.clientSecret()!); }
  const r = await withRetry(() => fetch(a.token, { method: 'POST', headers, body }));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(502, 'integration_error', j?.errors?.[0]?.message ?? j?.error_description ?? `Token exchange failed (${r.status})`);
  return j as { access_token: string; refresh_token?: string; expires_in?: number; user_id?: string; scope?: string };
}

async function accessToken(row: typeof integrations.$inferSelect) {
  if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() - Date.now() < 60_000 && row.refreshTokenEnc) {
    const t = await tokenRequest(row.provider as Provider, { grant_type: 'refresh_token', refresh_token: decrypt(row.refreshTokenEnc)! });
    await db.update(integrations).set({ accessTokenEnc: encrypt(t.access_token), refreshTokenEnc: t.refresh_token ? encrypt(t.refresh_token) : row.refreshTokenEnc, tokenExpiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null }).where(eq(integrations.id, row.id));
    return t.access_token;
  }
  return decrypt(row.accessTokenEnc)!;
}

async function getJson(url: string, token: string) {
  const r = await withRetry(() => fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }));
  if (r.status === 401) throw new ApiError(401, 'integration_unauthorized', 'The provider rejected the token. Reconnect this device.');
  if (!r.ok) throw new ApiError(502, 'integration_error', `Provider returned ${r.status}`);
  return r.json();
}

/** Pulls recent days from the provider and upserts them as DEVICE-sourced rows. */
export async function syncProvider(row: typeof integrations.$inferSelect, days = 7) {
  const uid = row.userId;
  const ds = lastNDays(days, 'UTC');
  let counts = { activity: 0, sleep: 0, metrics: 0 };
  const upsertSteps = async (date: string, steps: number, km?: number) => {
    await db.insert(activityLogs).values({ userId: uid, date, steps, distanceKm: km ?? null, source: 'DEVICE' })
      .onConflictDoUpdate({ target: [activityLogs.userId, activityLogs.date, activityLogs.source], set: { steps, distanceKm: km ?? null } });
    counts.activity++;
  };
  const upsertSleep = async (wakeDate: string, bed: Date, wake: Date, quality: number, stages: unknown) => {
    await db.insert(sleepLogs).values({ userId: uid, wakeDate, bedtime: bed, wakeTime: wake, quality, stages, source: 'DEVICE' })
      .onConflictDoUpdate({ target: [sleepLogs.userId, sleepLogs.wakeDate, sleepLogs.source], set: { bedtime: bed, wakeTime: wake, quality, stages } });
    counts.sleep++;
  };

  if (row.sandbox) {
    // Development sandbox: deterministic sample data, tagged so it can never be mistaken for real readings.
    for (const [i, d] of ds.entries()) await upsertSteps(d, 6000 + ((i * 1373) % 5000), undefined);
    counts = { ...counts };
    return { ...counts, sandbox: true };
  }

  const token = await accessToken(row);
  const from = ds[0], to = ds[ds.length - 1];
  if (row.provider === 'FITBIT') {
    const steps = await getJson(`https://api.fitbit.com/1/user/-/activities/steps/date/${from}/${to}.json`, token);
    for (const s of steps['activities-steps'] ?? []) await upsertSteps(s.dateTime, Number(s.value));
    const sleep = await getJson(`https://api.fitbit.com/1.2/user/-/sleep/date/${from}/${to}.json`, token);
    for (const s of (sleep.sleep ?? []).filter((x: { isMainSleep: boolean }) => x.isMainSleep))
      await upsertSleep(s.dateOfSleep, new Date(s.startTime), new Date(s.endTime), Math.max(1, Math.min(5, Math.round((s.efficiency ?? 80) / 20))), s.levels?.summary ?? null);
    const hr = await getJson(`https://api.fitbit.com/1/user/-/activities/heart/date/${from}/${to}.json`, token);
    for (const h of hr['activities-heart'] ?? []) if (h.value?.restingHeartRate) {
      await db.insert(healthMetrics).values({ userId: uid, kind: 'RESTING_HEART_RATE', value: h.value.restingHeartRate, unit: 'bpm', source: 'DEVICE', deviceId: 'fitbit', measuredAt: new Date(`${h.dateTime}T08:00:00Z`) });
      counts.metrics++;
    }
  } else if (row.provider === 'OURA') {
    const act = await getJson(`https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${from}&end_date=${addDays(to, 1)}`, token);
    for (const a of act.data ?? []) await upsertSteps(a.day, a.steps, a.equivalent_walking_distance ? a.equivalent_walking_distance / 1000 : undefined);
    const sl = await getJson(`https://api.ouraring.com/v2/usercollection/sleep?start_date=${from}&end_date=${addDays(to, 1)}`, token);
    for (const s of (sl.data ?? []).filter((x: { type: string }) => x.type === 'long_sleep'))
      await upsertSleep(s.day, new Date(s.bedtime_start), new Date(s.bedtime_end), Math.max(1, Math.min(5, Math.round((s.efficiency ?? 80) / 20))), { deep: s.deep_sleep_duration, rem: s.rem_sleep_duration, light: s.light_sleep_duration, awake: s.awake_time });
  } else if (row.provider === 'WHOOP') {
    const sl = await getJson(`https://api.prod.whoop.com/developer/v1/activity/sleep?start=${from}T00:00:00Z&limit=25`, token);
    for (const s of sl.records ?? []) if (!s.nap)
      await upsertSleep(String(s.end).slice(0, 10), new Date(s.start), new Date(s.end), Math.max(1, Math.min(5, Math.round((s.score?.sleep_performance_percentage ?? 80) / 20))), s.score?.stage_summary ?? null);
  }
  await db.update(integrations).set({ lastSyncAt: new Date(), lastError: null, status: 'CONNECTED' }).where(eq(integrations.id, row.id));
  return counts;
}

export async function findIntegration(userId: string, provider: Provider) {
  const [row] = await db.select().from(integrations).where(and(eq(integrations.userId, userId), eq(integrations.provider, provider)));
  return row ?? null;
}
