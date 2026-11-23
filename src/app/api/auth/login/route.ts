import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { route, ApiError } from '@/lib/http';
import { issueSession, verifyPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';

const Body = z.object({ email: z.string().trim().toLowerCase().email().optional(), phone: z.string().trim().optional(), password: z.string().min(1).max(200) })
  .refine((b) => b.email || b.phone, 'Email or phone is required');

export const POST = route({ auth: false, body: Body, rate: [10, 300] }, async ({ body, req, ip }) => {
  const [u] = await db.select().from(users).where(body.email ? eq(users.email, body.email) : eq(users.phone, body.phone!));
  const ok = await verifyPassword(body.password, u?.passwordHash ?? null);
  if (!u || !ok) { await audit(u?.id ?? null, 'auth.login_failed', null, { email: body.email }, ip); throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect'); }
  if (u.status !== 'ACTIVE') throw new ApiError(403, 'account_' + u.status.toLowerCase(), u.status === 'SUSPENDED' ? 'This account is suspended. Contact support.' : 'This account is not active');
  await audit(u.id, 'auth.login', { type: 'user', id: u.id }, undefined, ip);
  return issueSession(u.id, req);
});
