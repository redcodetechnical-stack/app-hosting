import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { profiles, users } from '@/db/schema';
import { route, ApiError, unauthorized } from '@/lib/http';
import { consumeOtp } from '@/lib/otp';
import { authenticate, issueSession, roleId } from '@/lib/auth';
import { audit } from '@/lib/audit';

const Body = z.object({ target: z.string().trim().min(5).max(120), code: z.string().regex(/^\d{6}$/), purpose: z.enum(['LOGIN', 'VERIFY_EMAIL', 'VERIFY_PHONE']) });

export const POST = route({ auth: false, body: Body, rate: [10, 600] }, async ({ body, req, ip }) => {
  const target = await consumeOtp(body.target, body.code, body.purpose);
  if (body.purpose === 'LOGIN') {
    const phone = target.startsWith('+');
    let [u] = await db.select().from(users).where(phone ? eq(users.phone, target) : eq(users.email, target));
    let created = false;
    if (!u) {
      [u] = await db.insert(users).values({ email: phone ? null : target, phone: phone ? target : null, emailVerifiedAt: phone ? null : new Date(), phoneVerifiedAt: phone ? new Date() : null, roleId: await roleId('USER') }).returning();
      await db.insert(profiles).values({ userId: u.id });
      created = true;
    } else if (u.status !== 'ACTIVE') throw new ApiError(403, 'account_inactive', 'This account is not active');
    await audit(u.id, created ? 'auth.register' : 'auth.login', { type: 'user', id: u.id }, { method: 'otp' }, ip);
    return issueSession(u.id, req, { created, needsConsent: created }, created ? 201 : 200);
  }
  const auth = await authenticate(req);
  if (!auth) throw unauthorized('Sign in to verify this contact');
  if (body.purpose === 'VERIFY_EMAIL') await db.update(users).set({ email: target, emailVerifiedAt: new Date() }).where(eq(users.id, auth.user.id));
  else await db.update(users).set({ phone: target, phoneVerifiedAt: new Date() }).where(eq(users.id, auth.user.id));
  return NextResponse.json({ verified: true, target });
});
