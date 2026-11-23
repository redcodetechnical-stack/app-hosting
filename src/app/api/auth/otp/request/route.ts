import { z } from 'zod';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { otpCodes, users } from '@/db/schema';
import { route, ApiError, notConfigured } from '@/lib/http';
import { otpCode, otpHash } from '@/lib/crypto';
import { configured, env } from '@/lib/env';
import { sendEmail, sendSms } from '@/lib/messaging';

const Body = z.object({
  target: z.string().trim().min(5).max(120),
  purpose: z.enum(['LOGIN', 'VERIFY_EMAIL', 'VERIFY_PHONE', 'RESET_PASSWORD', 'DELETE_ACCOUNT']),
});
const isPhone = (t: string) => /^\+[1-9]\d{7,14}$/.test(t);

export const POST = route({ auth: false, body: Body, rate: [5, 600] }, async ({ body }) => {
  const target = isPhone(body.target) ? body.target : body.target.toLowerCase();
  if (!isPhone(target) && !z.string().email().safeParse(target).success) throw new ApiError(422, 'validation_error', 'Use an email address or a phone number in +91XXXXXXXXXX format');
  // Throttle: max 3 live codes in 10 minutes for one target
  const recent = await db.select({ id: otpCodes.id }).from(otpCodes).where(and(eq(otpCodes.target, target), gt(otpCodes.createdAt, new Date(Date.now() - 600_000)), isNull(otpCodes.consumedAt)));
  if (recent.length >= 3) throw new ApiError(429, 'rate_limited', 'Too many codes requested. Wait a few minutes.');
  const viaSms = isPhone(target);
  const providerReady = viaSms ? configured.sms() : configured.email();
  if (!providerReady && env.isProd) throw notConfigured(viaSms ? 'SMS (Twilio)' : 'Email (Resend)');
  // Do not reveal whether an account exists for password resets
  if (body.purpose === 'RESET_PASSWORD') {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, target));
    if (!u) return { sent: true, channel: viaSms ? 'sms' : 'email' };
  }
  const code = otpCode();
  await db.insert(otpCodes).values({ target, purpose: body.purpose, codeHash: otpHash(target, code), expiresAt: new Date(Date.now() + 10 * 60_000) });
  const text = `Your Vitalora code is ${code}. It expires in 10 minutes. Never share it.`;
  const d = viaSms ? await sendSms(target, text) : await sendEmail(target, 'Your Vitalora code', `<p>${text}</p>`);
  return { sent: d.delivered, channel: viaSms ? 'sms' : 'email', ...(d.delivered ? {} : { devCode: code, note: 'Provider not configured: code returned for development only. Never returned in production.' }) };
});
