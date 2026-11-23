import { z } from 'zod';
import { and, avg, count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { appointments, professionals, reviews } from '@/db/schema';
import { route, notFound, ApiError } from '@/lib/http';

export const POST = route({ body: z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(1000).optional() }) }, async ({ user, params, body }) => {
  const [a] = await db.select().from(appointments).where(and(eq(appointments.id, params.id), eq(appointments.userId, user.id)));
  if (!a || !a.professionalId) throw notFound();
  if (a.status !== 'COMPLETED') throw new ApiError(409, 'not_completed', 'You can review only after a completed consultation');
  const [r] = await db.insert(reviews).values({ professionalId: a.professionalId, userId: user.id, appointmentId: a.id, ...body }).returning();
  const [s] = await db.select({ a: avg(reviews.rating), n: count() }).from(reviews).where(eq(reviews.professionalId, a.professionalId));
  await db.update(professionals).set({ ratingAvg: Math.round(Number(s.a) * 10) / 10, ratingCount: s.n }).where(eq(professionals.id, a.professionalId));
  return Response.json(r, { status: 201 });
});
