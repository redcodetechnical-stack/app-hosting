import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { appointments, availabilitySlots } from '@/db/schema';
import { route, notFound, ApiError } from '@/lib/http';
import { myProfessional } from '@/lib/pro';
import { createVideoRoom } from '@/lib/external';
import { notify } from '@/lib/messaging';

const NEXT: Record<string, string[]> = { REQUESTED: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'], COMPLETED: [], CANCELLED: [], NO_SHOW: [] };

export const PATCH = route({ perm: 'professional.portal', body: z.object({ status: z.enum(['CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']), videoRoomUrl: z.string().url().optional() }) }, async ({ user, params, body }) => {
  const p = await myProfessional(user.id);
  const [a] = await db.select().from(appointments).where(and(eq(appointments.id, params.id), eq(appointments.professionalId, p.id)));
  if (!a) throw notFound();
  if (!NEXT[a.status].includes(body.status)) throw new ApiError(409, 'bad_transition', `Cannot move from ${a.status} to ${body.status}`);
  let video = body.videoRoomUrl ?? a.videoRoomUrl;
  if (body.status === 'CONFIRMED' && !video) video = await createVideoRoom(a.id, a.startsAt);
  const [r] = await db.update(appointments).set({ status: body.status, videoRoomUrl: video }).where(eq(appointments.id, a.id)).returning();
  if (body.status === 'CANCELLED' && a.slotId) await db.update(availabilitySlots).set({ booked: false }).where(eq(availabilitySlots.id, a.slotId));
  await notify({ userId: a.userId, type: 'APPOINTMENT', title: `Appointment ${body.status.toLowerCase().replace('_', ' ')}`, body: `${p.displayName} updated your appointment on ${a.startsAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`, dedupeKey: `appt:${a.id}:${body.status}`, channels: ['PUSH'] });
  return { ...r, notesEnc: undefined };
});
