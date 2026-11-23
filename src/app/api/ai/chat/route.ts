import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { aiChatMessages, aiConversations } from '@/db/schema';
import { route, notFound } from '@/lib/http';
import { aiStream, CRISIS_REPLY, detectCrisis, langName, SAFETY_RULES, userContext, type ChatMsg } from '@/lib/ai';
import { checkAiAccess, DISCLAIMER } from '@/lib/aitools';
import { decrypt, encrypt } from '@/lib/crypto';
import { configured, env } from '@/lib/env';
import { notConfigured } from '@/lib/http';

const Body = z.object({ conversationId: z.string().optional(), message: z.string().trim().min(1).max(4000), language: z.enum(['en', 'hi']).optional() });

/** Conversational coach. Streams Server-Sent Events by default (event: delta / done); ?stream=0 returns JSON. */
export const POST = route({ body: Body, rate: [20, 60] }, async ({ user, body, query }) => {
  const crisisEarly = detectCrisis(body.message);
  if (!crisisEarly && !configured.ai() && !env.sandbox) throw notConfigured('AI provider (ANTHROPIC_API_KEY or OPENAI_API_KEY)');
  const ctx = await userContext(user.id);
  const lang = body.language ?? ctx.profile.language;
  let conv;
  if (body.conversationId) {
    [conv] = await db.select().from(aiConversations).where(and(eq(aiConversations.id, body.conversationId), eq(aiConversations.userId, user.id)));
    if (!conv) throw notFound('Conversation not found');
  } else {
    [conv] = await db.insert(aiConversations).values({ userId: user.id, title: body.message.slice(0, 60), language: lang, provider: env.aiProvider, model: env.aiProvider === 'openai' ? env.openaiModel : env.anthropicModel }).returning();
  }
  const crisis = detectCrisis(body.message);
  if (!crisis) await checkAiAccess(user.id);
  await db.insert(aiChatMessages).values({ conversationId: conv.id, role: 'USER', contentEnc: encrypt(body.message)!, flagged: crisis });

  // Crisis language: answer with support resources immediately, without calling the model.
  if (crisis) {
    const text = CRISIS_REPLY[lang === 'hi' ? 'hi' : 'en'];
    await db.insert(aiChatMessages).values({ conversationId: conv.id, role: 'ASSISTANT', contentEnc: encrypt(text)!, flagged: true });
    return { conversationId: conv.id, reply: text, crisis: true };
  }

  const prior = await db.select().from(aiChatMessages).where(eq(aiChatMessages.conversationId, conv.id)).orderBy(asc(aiChatMessages.createdAt));
  const history: ChatMsg[] = prior.slice(-20).map((m) => ({ role: m.role === 'USER' ? 'user' : 'assistant', content: decrypt(m.contentEnc) ?? '' }));
  const system = `You are Vitalora Coach, a warm, practical wellness coach. Personalise using the user's data below. Keep replies under 180 words, plain text, with 2-4 concrete next steps when useful. Reply in ${langName(lang)}.\n\n${SAFETY_RULES}\n\n${ctx.text}`;

  const save = async (r: { text: string; tokensIn?: number; tokensOut?: number }) => {
    await db.insert(aiChatMessages).values({ conversationId: conv!.id, role: 'ASSISTANT', contentEnc: encrypt(r.text || '(no response)')!, tokensIn: r.tokensIn, tokensOut: r.tokensOut });
    await db.update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, conv!.id));
  };

  if (query.get('stream') === '0') {
    let text = '';
    for await (const d of aiStream({ system, messages: history }, save)) text += d;
    return { conversationId: conv.id, reply: text, crisis: false, disclaimer: DISCLAIMER };
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (event: string, data: unknown) => ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send('start', { conversationId: conv!.id });
      try { for await (const d of aiStream({ system, messages: history }, save)) send('delta', { text: d }); send('done', { conversationId: conv!.id, disclaimer: DISCLAIMER }); }
      catch (e) { send('error', { message: (e as Error).message ?? 'AI error' }); }
      ctl.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
});
