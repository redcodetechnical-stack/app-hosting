import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { otpCodes, users } from '@/db/schema';
import { route } from '@/lib/http';
import { otpCode, otpHash } from '@/lib/crypto';
import { sendEmail } from '@/lib/messaging';
import { env } from '@/lib/env';

export const POST = route({ auth: false, body: z.object({ email: z.string().trim().toLowerCase().email() }), rate: [5, 900] }, async ({ body }) => {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email));
  let devCode: string | undefined;
  if (u) {
    const code = otpCode();
    await db.insert(otpCodes).values({ target: body.email, purpose: 'RESET_PASSWORD', codeHash: otpHash(body.email, code), expiresAt: new Date(Date.now() + 15 * 60_000) });
    const d = await sendEmail(body.email, 'Reset your Vitalora password', `<p>Your password reset code is <b>${code}</b>. It expires in 15 minutes. If you did not ask for this, ignore this email.</p>`);
    if (!d.delivered && !env.isProd) devCode = code;
  }
  // Same response whether or not the account exists
  return { ok: true, message: 'If an account exists for this email, a reset code has been sent.', ...(devCode ? { devCode } : {}) };
});
