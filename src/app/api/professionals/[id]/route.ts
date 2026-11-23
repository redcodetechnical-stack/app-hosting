import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { availabilitySlots, profiles, professionals, reviews } from '@/db/schema';
import { route, notFound } from '@/lib/http';

export const GET = route({ auth: false }, async ({ params }) => {
  const [p] = await db.select().from(professionals).where(and(eq(professionals.id, params.id), eq(professionals.status, 'VERIFIED')));
  if (!p) throw notFound();
  const slots = await db.select({ id: availabilitySlots.id, startsAt: availabilitySlots.startsAt, endsAt: availabilitySlots.endsAt }).from(availabilitySlots)
    .where(and(eq(availabilitySlots.professionalId, p.id), eq(availabilitySlots.booked, false), gt(availabilitySlots.startsAt, new Date()))).orderBy(asc(availabilitySlots.startsAt)).limit(60);
  const rv = await db.select({ rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt, name: profiles.name }).from(reviews).leftJoin(profiles, eq(profiles.userId, reviews.userId)).where(eq(reviews.professionalId, p.id)).orderBy(desc(reviews.createdAt)).limit(20);
  const { registrationNo: _r, verifiedById: _v, userId: _u, ...pub } = p;
  return { ...pub, registrationVerified: !!p.verifiedAt, slots, reviews: rv.map((r) => ({ ...r, name: r.name ? r.name.split(' ')[0] : 'Member' })) };
});
