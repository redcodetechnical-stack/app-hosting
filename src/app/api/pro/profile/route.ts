import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { professionals } from '@/db/schema';
import { route } from '@/lib/http';
import { myProfessional } from '@/lib/pro';

export const GET = route({}, async ({ user }) => myProfessional(user.id, false));
export const PATCH = route({ body: z.object({ displayName: z.string().trim().min(2).max(80).optional(), bio: z.string().max(2000).optional(), languages: z.array(z.string().max(20)).max(10).optional(), city: z.string().max(60).optional(), feeInr: z.number().int().min(0).max(100000).optional(), specializations: z.array(z.string().max(40)).min(1).max(10).optional() }) }, async ({ user, body }) => {
  const p = await myProfessional(user.id, false);
  const [r] = await db.update(professionals).set(body).where(eq(professionals.id, p.id)).returning();
  return r;
});
