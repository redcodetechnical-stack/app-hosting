import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { supportTickets, ticketMessages, users } from '@/db/schema';
import { route, notFound } from '@/lib/http';
import { notify } from '@/lib/messaging';
import { audit } from '@/lib/audit';

export const GET = route({ perm: 'support.manage' }, async ({ params }) => {
  const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, params.id));
  if (!t) throw notFound();
  return { ...t, messages: await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, t.id)).orderBy(asc(ticketMessages.createdAt)) };
});
export const PATCH = route({ perm: 'support.manage', body: z.object({ status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']).optional(), priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(), assigneeId: z.string().nullable().optional() }) }, async ({ user, params, body, ip }) => {
  const [t] = await db.update(supportTickets).set(body).where(eq(supportTickets.id, params.id)).returning();
  if (!t) throw notFound();
  await audit(user.id, 'admin.ticket_update', { type: 'ticket', id: t.id }, body, ip);
  return t;
});
/** Reply (internal=true for staff-only notes). Public replies notify the user. */
export const POST = route({ perm: 'support.manage', body: z.object({ message: z.string().trim().min(1).max(5000), internal: z.boolean().default(false) }) }, async ({ user, params, body }) => {
  const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, params.id));
  if (!t) throw notFound();
  const [m] = await db.insert(ticketMessages).values({ ticketId: t.id, authorId: user.id, body: body.message, internal: body.internal }).returning();
  if (!body.internal) {
    await db.update(supportTickets).set({ status: 'PENDING', assigneeId: t.assigneeId ?? user.id }).where(eq(supportTickets.id, t.id));
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, t.userId));
    await notify({ userId: t.userId, type: 'SYSTEM', title: `Support replied: ${t.subject}`, body: body.message.slice(0, 200), dedupeKey: `tkt:${m.id}`, channels: ['EMAIL'], email: u?.email });
  }
  return Response.json(m, { status: 201 });
});
