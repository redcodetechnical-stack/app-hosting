import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { availabilitySlots } from '@/db/schema';
import { route, notFound, conflict } from '@/lib/http';
import { myProfessional } from '@/lib/pro';

export const DELETE = route({ perm: 'professional.portal' }, async ({ user, params }) => {
  const p = await myProfessional(user.id);
  const [s] = await db.select().from(availabilitySlots).where(and(eq(availabilitySlots.id, params.id), eq(availabilitySlots.professionalId, p.id)));
  if (!s) throw notFound();
  if (s.booked) throw conflict('This slot is booked. Cancel the appointment instead.');
  await db.delete(availabilitySlots).where(eq(availabilitySlots.id, s.id));
  return { ok: true };
});
