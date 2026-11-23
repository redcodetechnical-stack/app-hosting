import { and, count, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import { aiChatMessages, aiConversations, aiReports } from '@/db/schema';
import { aiComplete, parseJson, SAFETY_RULES, langName, type AiImage } from './ai';
import { encrypt } from './crypto';
import { ApiError } from './http';
import { currentPlan, PLANS, type Plan } from './plans';

export const DISCLAIMER = 'General wellness information, not medical advice. For symptoms, readings that worry you, or medicines, consult a qualified doctor.';

export async function aiUsageToday(userId: string) {
  const since = new Date(Date.now() - 864e5);
  const [{ m }] = await db.select({ m: count() }).from(aiChatMessages).innerJoin(aiConversations, eq(aiChatMessages.conversationId, aiConversations.id))
    .where(and(eq(aiConversations.userId, userId), eq(aiChatMessages.role, 'USER'), gte(aiChatMessages.createdAt, since)));
  const [{ r }] = await db.select({ r: count() }).from(aiReports).where(and(eq(aiReports.userId, userId), gte(aiReports.createdAt, since)));
  return m + r;
}

/** Enforces plan gating + the rolling 24 h AI budget. */
export async function checkAiAccess(userId: string, needs: Plan[] = ['FREE', 'PREMIUM', 'FAMILY']) {
  const { plan } = await currentPlan(userId);
  if (!needs.includes(plan)) throw new ApiError(402, 'upgrade_required', 'AI health tools are part of Premium. Start a free trial from Plans.');
  const used = await aiUsageToday(userId);
  const limit = PLANS[plan].limits.aiPerDay;
  if (used >= limit) throw new ApiError(429, 'ai_quota', `You have used today's ${limit} AI requests on the ${PLANS[plan].name} plan.`);
  return { plan, used, limit };
}

export async function runTool<T = unknown>(o: { userId: string; kind: string; language?: string; task: string; prompt: string; input?: unknown; json?: boolean; images?: AiImage[]; maxTokens?: number; save?: boolean }) {
  const system = `You are Vitalora's AI health assistant. ${o.task}\n\n${SAFETY_RULES}\n\nWrite in ${langName(o.language ?? 'en')}.${o.json ? '\nReply with ONLY valid JSON matching the requested shape, no prose outside JSON.' : ''}`;
  const r = await aiComplete({ system, messages: [{ role: 'user', content: o.prompt }], images: o.images, maxTokens: o.maxTokens ?? 1800 });
  let output: unknown = r.text;
  if (o.json) {
    const parsed = parseJson<T>(r.text);
    if (!parsed && !r.sandbox) throw new ApiError(502, 'ai_bad_output', 'The AI response could not be read. Please try again.');
    output = parsed ?? { sandbox: true, text: r.text };
  }
  let id: string | undefined;
  if (o.save !== false) {
    const [row] = await db.insert(aiReports).values({ userId: o.userId, kind: o.kind, input: (o.input ?? null) as never, outputEnc: encrypt(typeof output === 'string' ? output : JSON.stringify(output))!, provider: r.provider, model: r.model }).returning({ id: aiReports.id });
    id = row.id;
  }
  return { id, kind: o.kind, output: output as T, provider: r.provider, model: r.model, sandbox: !!r.sandbox, disclaimer: DISCLAIMER };
}

