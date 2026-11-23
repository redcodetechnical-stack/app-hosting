import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { aiChatMessages, aiConversations } from '@/db/schema';
import { route, notFound } from '@/lib/http';
import { decrypt } from '@/lib/crypto';

export const GET = route({}, async ({ user, params }) => {
  const [c] = await db.select().from(aiConversations).where(and(eq(aiConversations.id, params.id), eq(aiConversations.userId, user.id)));
  if (!c) throw notFound();
  const ms = await db.select().from(aiChatMessages).where(eq(aiChatMessages.conversationId, c.id)).orderBy(asc(aiChatMessages.createdAt));
  return { ...c, messages: ms.map((m) => ({ id: m.id, role: m.role, content: decrypt(m.contentEnc), flagged: m.flagged, createdAt: m.createdAt })) };
});
export const DELETE = route({}, async ({ user, params }) => {
  const r = await db.delete(aiConversations).where(and(eq(aiConversations.id, params.id), eq(aiConversations.userId, user.id))).returning();
  if (!r.length) throw notFound();
  return { ok: true };
});
