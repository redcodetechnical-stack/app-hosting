import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminRoles, professionals, users } from '@/db/schema';
import { route, notFound } from '@/lib/http';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/messaging';
import { clearPermCache } from '@/lib/auth';

/** Verify / reject / suspend. Verifying promotes a plain USER to the PROFESSIONAL role (portal access). */
export const PATCH = route({ perm: 'professionals.verify', body: z.object({ status: z.enum(['VERIFIED', 'REJECTED', 'SUSPENDED', 'PENDING']), note: z.string().max(500).optional() }) }, async ({ user, params, body, ip }) => {
  const [p] = await db.update(professionals).set({ status: body.status, verifiedAt: body.status === 'VERIFIED' ? new Date() : null, verifiedById: body.status === 'VERIFIED' ? user.id : null }).where(eq(professionals.id, params.id)).returning();
  if (!p) throw notFound();
  const [u] = await db.select({ roleKey: adminRoles.key }).from(users).innerJoin(adminRoles, eq(adminRoles.id, users.roleId)).where(eq(users.id, p.userId));
  const [proRole] = await db.select().from(adminRoles).where(eq(adminRoles.key, body.status === 'VERIFIED' ? 'PROFESSIONAL' : 'USER'));
  if ((body.status === 'VERIFIED' && u.roleKey === 'USER') || (body.status !== 'VERIFIED' && u.roleKey === 'PROFESSIONAL')) { await db.update(users).set({ roleId: proRole.id }).where(eq(users.id, p.userId)); clearPermCache(); }
  await notify({ userId: p.userId, type: 'SYSTEM', title: `Professional profile ${body.status.toLowerCase()}`, body: body.note ?? (body.status === 'VERIFIED' ? 'You are now listed in the Vitalora directory.' : 'Your professional profile status changed.'), dedupeKey: `pro:${p.id}:${body.status}:${Date.now()}` });
  await audit(user.id, 'admin.professional_status', { type: 'professional', id: p.id }, body, ip);
  return p;
});
