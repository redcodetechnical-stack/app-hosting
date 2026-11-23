import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { supportTickets, ticketMessages } from '@/db/schema';
import { route } from '@/lib/http';

export const GET = route({}, async ({ user }) => ({ items: await db.select().from(supportTickets).where(eq(supportTickets.userId, user.id)).orderBy(desc(supportTickets.updatedAt)) }));
export const POST = route({ body: z.object({ subject: z.string().trim().min(3).max(120), message: z.string().trim().min(5).max(5000) }), rate: [5, 3600] }, async ({ user, body }) => {
  const [t] = await db.insert(supportTickets).values({ userId: user.id, subject: body.subject }).returning();
  await db.insert(ticketMessages).values({ ticketId: t.id, authorId: user.id, body: body.message });
  return Response.json(t, { status: 201 });
});
