import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, users } from '@/db/schema';
import { route } from '@/lib/http';
import { hashPassword, passwordRule } from '@/lib/auth';
import { consumeOtp } from '@/lib/otp';
import { audit } from '@/lib/audit';

const Body = z.object({ email: z.string().trim().toLowerCase().email(), code: z.string().regex(/^\d{6}$/), newPassword: z.string().min(passwordRule.min).max(passwordRule.max).regex(passwordRule.re, 'Use letters and at least one number') });

export const POST = route({ auth: false, body: Body, rate: [10, 900] }, async ({ body, ip }) => {
  await consumeOtp(body.email, body.code, 'RESET_PASSWORD');
  const [u] = await db.update(users).set({ passwordHash: await hashPassword(body.newPassword) }).where(eq(users.email, body.email)).returning({ id: users.id });
  if (u) { await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, u.id)); await audit(u.id, 'auth.password_reset', { type: 'user', id: u.id }, undefined, ip); }
  return { ok: true, message: 'Password updated. Sign in with your new password.' };
});
