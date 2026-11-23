import { and, asc, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import { appointments, profiles } from '@/db/schema';
import { route } from '@/lib/http';
import { myProfessional } from '@/lib/pro';
import { decrypt } from '@/lib/crypto';

export const GET = route({ perm: 'professional.portal' }, async ({ user, query }) => {
  const p = await myProfessional(user.id);
  const from = query.get('all') === 'true' ? new Date(0) : new Date(Date.now() - 864e5);
  const rows = await db.select({ a: appointments, patientName: profiles.name }).from(appointments).leftJoin(profiles, eq(profiles.userId, appointments.userId))
    .where(and(eq(appointments.professionalId, p.id), gte(appointments.startsAt, from))).orderBy(asc(appointments.startsAt));
  return { items: rows.map(({ a, patientName }) => ({ ...a, notesEnc: undefined, notes: decrypt(a.notesEnc), patientName: patientName ?? 'Patient' })) };
});
