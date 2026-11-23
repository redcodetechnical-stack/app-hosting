import { SignJWT, importPKCS8 } from 'jose';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { devices, notifications } from '@/db/schema';
import { configured, env } from './env';
import { withRetry } from './retry';

export type Delivery = { delivered: boolean; reason?: string; id?: string };

export async function sendEmail(to: string, subject: string, html: string): Promise<Delivery> {
  if (!configured.email()) { if (!env.isProd) console.info(`[email:not_configured] to=${to} subject=${subject}`); return { delivered: false, reason: 'not_configured' }; }
  const r = await withRetry(() => fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.emailFrom, to, subject, html }),
  }));
  const j = await r.json().catch(() => ({}));
  return r.ok ? { delivered: true, id: j.id } : { delivered: false, reason: j?.message ?? `resend_${r.status}` };
}

export async function sendSms(to: string, body: string): Promise<Delivery> {
  if (!configured.sms()) { if (!env.isProd) console.info(`[sms:not_configured] to=${to}`); return { delivered: false, reason: 'not_configured' }; }
  const r = await withRetry(() => fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: env.twilioFrom!, Body: body }),
  }));
  const j = await r.json().catch(() => ({}));
  return r.ok ? { delivered: true, id: j.sid } : { delivered: false, reason: j?.message ?? `twilio_${r.status}` };
}

let fcmToken: { token: string; exp: number } | null = null;
async function fcmAccessToken() {
  if (fcmToken && fcmToken.exp > Date.now() + 60_000) return fcmToken.token;
  const key = await importPKCS8(env.fcmPrivateKey!.replace(/\\n/g, '\n'), 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(env.fcmClientEmail!).setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`fcm_token_${r.status}`);
  fcmToken = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return fcmToken.token;
}

export async function sendPush(userId: string, title: string, body: string, data?: Record<string, string>): Promise<Delivery> {
  if (!configured.push()) return { delivered: false, reason: 'not_configured' };
  const ds = await db.select().from(devices).where(eq(devices.userId, userId));
  const tokens = ds.map((d) => d.pushToken).filter(Boolean) as string[];
  if (!tokens.length) return { delivered: false, reason: 'no_devices' };
  const at = await fcmAccessToken();
  let ok = 0;
  for (const t of tokens) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${env.fcmProjectId}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token: t, notification: { title, body }, data } }),
    });
    if (r.ok) ok++;
    else if (r.status === 404 || r.status === 400) await db.update(devices).set({ pushToken: null }).where(eq(devices.pushToken, t)); // stale token
  }
  return ok ? { delivered: true } : { delivered: false, reason: 'push_failed' };
}

type NotifyInput = { userId: string; type: typeof notifications.$inferInsert.type; title: string; body: string; data?: Record<string, unknown>; dedupeKey?: string; channels?: ('PUSH' | 'EMAIL' | 'SMS')[]; email?: string | null; phone?: string | null };

/** Always stores an in-app notification; also fans out to the channels the user enabled and the server has configured. */
export async function notify(n: NotifyInput) {
  const [row] = await db.insert(notifications).values({
    userId: n.userId, type: n.type, channel: 'IN_APP', title: n.title, body: n.body, data: n.data ?? null, dedupeKey: n.dedupeKey, sentAt: new Date(),
  }).onConflictDoNothing({ target: notifications.dedupeKey }).returning();
  if (!row) return { created: false };
  const results: Record<string, Delivery> = {};
  for (const ch of n.channels ?? []) {
    try {
      if (ch === 'PUSH') results.push = await sendPush(n.userId, n.title, n.body);
      if (ch === 'EMAIL' && n.email) results.email = await sendEmail(n.email, n.title, `<p>${escapeHtml(n.body)}</p>`);
      if (ch === 'SMS' && n.phone) results.sms = await sendSms(n.phone, `${n.title}: ${n.body}`);
    } catch (e) { results[ch.toLowerCase()] = { delivered: false, reason: String((e as Error).message) }; }
  }
  return { created: true, id: row.id, results };
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
