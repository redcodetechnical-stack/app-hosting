import { z } from 'zod';
import { db } from '@/db';
import { professionals } from '@/db/schema';
import { route } from '@/lib/http';
import { audit } from '@/lib/audit';

/** Any user can apply to list as a professional; an admin with professionals.verify reviews the registration number. */
export const POST = route({ body: z.object({ displayName: z.string().trim().min(2).max(80), title: z.string().trim().min(2).max(60), specializations: z.array(z.string().max(40)).min(1).max(10), bio: z.string().max(2000).optional(), languages: z.array(z.string().max(20)).max(10).default(['English']), city: z.string().max(60).optional(), registrationNo: z.string().trim().min(3).max(60), yearsExp: z.number().int().min(0).max(70).optional(), feeInr: z.number().int().min(0).max(100000).optional() }), rate: [3, 3600] }, async ({ user, body, ip }) => {
  const [p] = await db.insert(professionals).values({ userId: user.id, ...body, status: 'PENDING' }).returning();
  await audit(user.id, 'professional.apply', { type: 'professional', id: p.id }, undefined, ip);
  return Response.json({ id: p.id, status: p.status, message: 'Application received. You will be notified after verification.' }, { status: 201 });
});
