import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { appointments, availabilitySlots, professionals } from '@/db/schema';
import { route, ApiError, badRequest, notFound } from '@/lib/http';
import { decrypt, encrypt } from '@/lib/crypto';
import { zIso } from '@/lib/crud';
import { notify } from '@/lib/messaging';

export const GET = route({}, async ({ user }) => {
  const rows = await db.select({ a: appointments, proName: professionals.displayName, proTitle: professionals.title }).from(appointments).leftJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(eq(appointments.userId, user.id)).orderBy(desc(appointments.startsAt));
  return { items: rows.map(({ a, proName, proTitle }) => ({ ...a, notesEnc: undefined, notes: decrypt(a.notesEnc), with: proName ?? a.externalName, title: proTitle })) };
});

/** Book a directory slot ({slotId}) or record an outside appointment ({externalName, startsAt}) for reminders. */
export const POST = route({ body: z.object({ slotId: z.string().optional(), externalName: z.string().trim().min(2).max(80).optional(), startsAt: zIso.optional(), notes: z.string().max(1000).optional() }), rate: [20, 3600] }, async ({ user, body }) => {
  if (body.slotId) {
    const result = await db.transaction(async (tx) => {
      const [slot] = await tx.update(availabilitySlots).set({ booked: true }).where(and(eq(availabilitySlots.id, body.slotId!), eq(availabilitySlots.booked, false))).returning();
      if (!slot) throw new ApiError(409, 'slot_taken', 'This slot is no longer available');
      if (slot.startsAt < new Date()) throw badRequest('This slot is in the past');
      const [pro] = await tx.select().from(professionals).where(eq(professionals.id, slot.professionalId));
      if (!pro || pro.status !== 'VERIFIED') throw notFound('Professional not available');
      if (pro.userId === user.id) throw badRequest('You cannot book yourself');
      const [a] = await tx.insert(appointments).values({ userId: user.id, professionalId: pro.id, slotId: slot.id, startsAt: slot.startsAt, endsAt: slot.endsAt, notesEnc: encrypt(body.notes), status: 'REQUESTED' }).returning();
      return { a, pro };
    });
    await notify({ userId: result.pro.userId, type: 'APPOINTMENT', title: 'New appointment request', body: `A new appointment was requested for ${result.a.startsAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`, dedupeKey: `appt:${result.a.id}:new`, channels: ['PUSH', 'EMAIL'] });
    return Response.json({ ...result.a, notesEnc: undefined }, { status: 201 });
  }
  if (!body.externalName || !body.startsAt) throw badRequest('Provide slotId, or externalName and startsAt');
  const [a] = await db.insert(appointments).values({ userId: user.id, externalName: body.externalName, startsAt: body.startsAt, notesEnc: encrypt(body.notes), status: 'CONFIRMED' }).returning();
  return Response.json({ ...a, notesEnc: undefined }, { status: 201 });
});
