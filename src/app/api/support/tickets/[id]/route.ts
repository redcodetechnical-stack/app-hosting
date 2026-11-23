import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { supportTickets, ticketMessages } from '@/db/schema';
import { route, notFound } from '@/lib/http';

async function own(userId: string, id: string) {
  const [t] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, id), eq(supportTickets.userId, userId)));
  if (!t) throw notFound();
  return t;
}
export const GET = route({}, async ({ user, params }) => {
  const t = await own(user.id, params.id);
  const ms = await db.select().from(ticketMessages).where(and(eq(ticketMessages.ticketId, t.id), eq(ticketMessages.internal, false))).orderBy(asc(ticketMessages.createdAt));
  return { ...t, messages: ms.map((m) => ({ id: m.id, body: m.body, fromSupport: m.authorId !== user.id, createdAt: m.createdAt })) };
});
export const POST = route({ body: z.object({ message: z.string().trim().min(1).max(5000) }), rate: [20, 3600] }, async ({ user, params, body }) => {
  const t = await own(user.id, params.id);
  const [m] = await db.insert(ticketMessages).values({ ticketId: t.id, authorId: user.id, body: body.message }).returning();
  await db.update(supportTickets).set({ status: 'OPEN' }).where(eq(supportTickets.id, t.id));
  return Response.json(m, { status: 201 });
});
