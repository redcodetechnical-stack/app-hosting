import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, users } from '@/db/schema';
import { route, ApiError } from '@/lib/http';
import { hashPassword, passwordRule, verifyPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';

const Body = z.object({ currentPassword: z.string().optional(), newPassword: z.string().min(passwordRule.min).max(passwordRule.max).regex(passwordRule.re, 'Use letters and at least one number') });

export const POST = route({ body: Body, rate: [10, 900] }, async ({ body, user, ip }) => {
  const [u] = await db.select().from(users).where(eq(users.id, user.id));
  if (u.passwordHash && !(await verifyPassword(body.currentPassword ?? '', u.passwordHash))) throw new ApiError(400, 'invalid_password', 'Current password is incorrect');
  await db.update(users).set({ passwordHash: await hashPassword(body.newPassword) }).where(eq(users.id, user.id));
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, user.id), ne(sessions.id, '')));
  await audit(user.id, 'auth.password_change', { type: 'user', id: user.id }, undefined, ip);
  return { ok: true, message: 'Password changed. Other devices have been signed out.' };
});
