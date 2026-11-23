import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { appointments, availabilitySlots, professionals } from '@/db/schema';
import { route, notFound, ApiError } from '@/lib/http';
import { decrypt, encrypt } from '@/lib/crypto';
import { notify } from '@/lib/messaging';

export const GET = route({}, async ({ user, params }) => {
  const [a] = await db.select().from(appointments).where(and(eq(appointments.id, params.id), eq(appointments.userId, user.id)));
  if (!a) throw notFound();
  return { ...a, notesEnc: undefined, notes: decrypt(a.notesEnc) };
});
/** Patient can cancel (frees the slot), update notes, or attach document URLs (from /api/uploads/sign). */
export const PATCH = route({ body: z.object({ cancel: z.boolean().optional(), notes: z.string().max(1000).optional(), documentUrls: z.array(z.string().url()).max(10).optional() }) }, async ({ user, params, body }) => {
  const [a] = await db.select().from(appointments).where(and(eq(appointments.id, params.id), eq(appointments.userId, user.id)));
  if (!a) throw notFound();
  const set: Record<string, unknown> = {};
  if (body.notes !== undefined) set.notesEnc = encrypt(body.notes);
  if (body.documentUrls) set.documentUrls = body.documentUrls;
  if (body.cancel) {
    if (!['REQUESTED', 'CONFIRMED'].includes(a.status)) throw new ApiError(409, 'bad_transition', 'This appointment cannot be cancelled');
    set.status = 'CANCELLED';
    if (a.slotId) await db.update(availabilitySlots).set({ booked: false }).where(eq(availabilitySlots.id, a.slotId));
    if (a.professionalId) { const [p] = await db.select().from(professionals).where(eq(professionals.id, a.professionalId)); if (p) await notify({ userId: p.userId, type: 'APPOINTMENT', title: 'Appointment cancelled', body: `An appointment on ${a.startsAt.toISOString().slice(0, 16).replace('T', ' ')} UTC was cancelled by the patient.`, dedupeKey: `appt:${a.id}:pcancel` }); }
  }
  const [r] = await db.update(appointments).set(set).where(eq(appointments.id, a.id)).returning();
  return { ...r, notesEnc: undefined, notes: decrypt(r.notesEnc) };
});
