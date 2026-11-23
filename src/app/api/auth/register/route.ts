import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { consents, profiles, users } from '@/db/schema';
import { route, conflict } from '@/lib/http';
import { hashPassword, issueSession, passwordRule, roleId } from '@/lib/auth';
import { audit } from '@/lib/audit';

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(passwordRule.min).max(passwordRule.max).regex(passwordRule.re, 'Use letters and at least one number'),
  name: z.string().trim().min(1).max(60),
  consent: z.object({ terms: z.literal(true), privacy: z.literal(true), healthData: z.literal(true), marketing: z.boolean().optional() }),
  timezone: z.string().max(60).optional(),
  language: z.enum(['en', 'hi']).optional(),
});

export const POST = route({ auth: false, body: Body, rate: [10, 3600] }, async ({ body, req, ip }) => {
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email));
  if (exists) throw conflict('An account with this email already exists');
  const [u] = await db.insert(users).values({ email: body.email, passwordHash: await hashPassword(body.password), roleId: await roleId('USER') }).returning();
  await db.insert(profiles).values({ userId: u.id, name: body.name, timezone: body.timezone ?? 'Asia/Kolkata', language: body.language ?? 'en' });
  await db.insert(consents).values([
    { userId: u.id, purpose: 'terms', version: '2026-11', granted: true, ip },
    { userId: u.id, purpose: 'privacy', version: '2026-11', granted: true, ip },
    { userId: u.id, purpose: 'health_data', version: '2026-11', granted: true, ip },
    { userId: u.id, purpose: 'marketing', version: '2026-11', granted: !!body.consent.marketing, ip },
  ]);
  await audit(u.id, 'auth.register', { type: 'user', id: u.id }, { method: 'email' }, ip);
  return issueSession(u.id, req, {}, 201);
});
