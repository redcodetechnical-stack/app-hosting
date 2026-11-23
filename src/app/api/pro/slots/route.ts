import { z } from 'zod';
import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { availabilitySlots } from '@/db/schema';
import { route, badRequest } from '@/lib/http';
import { myProfessional } from '@/lib/pro';
import { zIso } from '@/lib/crud';

export const GET = route({ perm: 'professional.portal' }, async ({ user }) => {
  const p = await myProfessional(user.id);
  return { items: await db.select().from(availabilitySlots).where(and(eq(availabilitySlots.professionalId, p.id), gt(availabilitySlots.startsAt, new Date(Date.now() - 864e5)))).orderBy(asc(availabilitySlots.startsAt)) };
});
/** Adds slots: either explicit {slots:[{startsAt,endsAt}]} or a series {from, count, minutes, gapMinutes}. */
export const POST = route({ perm: 'professional.portal', body: z.object({ slots: z.array(z.object({ startsAt: zIso, endsAt: zIso })).max(100).optional(), series: z.object({ from: zIso, count: z.number().int().min(1).max(48), minutes: z.number().int().min(10).max(180), gapMinutes: z.number().int().min(0).max(120).default(0) }).optional() }) }, async ({ user, body }) => {
  const p = await myProfessional(user.id);
  let list = body.slots ?? [];
  if (body.series) { const s = body.series; list = Array.from({ length: s.count }, (_, i) => { const st = new Date(s.from.getTime() + i * (s.minutes + s.gapMinutes) * 60000); return { startsAt: st, endsAt: new Date(st.getTime() + s.minutes * 60000) }; }); }
  if (!list.length) throw badRequest('Provide slots or series');
  if (list.some((x) => x.endsAt <= x.startsAt || x.startsAt < new Date())) throw badRequest('Slots must be in the future and end after they start');
  const rows = await db.insert(availabilitySlots).values(list.map((x) => ({ professionalId: p.id, ...x }))).onConflictDoNothing().returning();
  return Response.json({ created: rows.length, items: rows }, { status: 201 });
});
