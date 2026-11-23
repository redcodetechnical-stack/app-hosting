import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { appointments, professionals } from '@/db/schema';
import { route, paging } from '@/lib/http';

export const GET = route({ perm: 'appointments.manage' }, async ({ query }) => {
  const { limit, offset, page } = paging(query, 100);
  const st = query.get('status');
  const rows = await db.select({ id: appointments.id, userId: appointments.userId, professional: professionals.displayName, externalName: appointments.externalName, startsAt: appointments.startsAt, status: appointments.status, hasVideo: appointments.videoRoomUrl, createdAt: appointments.createdAt })
    .from(appointments).leftJoin(professionals, eq(professionals.id, appointments.professionalId)).where(st ? eq(appointments.status, st as never) : undefined).orderBy(desc(appointments.startsAt)).limit(limit).offset(offset);
  return { items: rows.map((r) => ({ ...r, hasVideo: !!r.hasVideo })), page, limit };
});
