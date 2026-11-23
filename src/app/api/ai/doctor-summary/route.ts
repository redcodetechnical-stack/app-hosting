import { z } from 'zod';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import { healthMetrics } from '@/db/schema';
import { route } from '@/lib/http';
import { checkAiAccess, runTool } from '@/lib/aitools';
import { userContext } from '@/lib/ai';

/** Prepares a factual one-page summary of tracked data + the user's own questions, to take to an appointment. */
export const POST = route({ body: z.object({ days: z.number().int().min(7).max(90).default(30), concerns: z.string().max(1500).optional() }), rate: [5, 3600] }, async ({ user, body }) => {
  await checkAiAccess(user.id, ['PREMIUM', 'FAMILY']);
  const ctx = await userContext(user.id, Math.min(body.days, 30));
  const ms = await db.select().from(healthMetrics).where(and(eq(healthMetrics.userId, user.id), gte(healthMetrics.measuredAt, new Date(Date.now() - body.days * 864e5)))).orderBy(desc(healthMetrics.measuredAt)).limit(100);
  const readings = ms.map((m) => `${m.measuredAt.toISOString().slice(0, 10)} ${m.kind} ${m.value}${m.value2 != null ? '/' + m.value2 : ''} ${m.unit} (${m.source.toLowerCase()})`).join('\n') || 'none recorded';
  return runTool({
    userId: user.id, kind: 'doctor_summary', language: 'en', json: true, input: body, maxTokens: 2500,
    task: 'Prepare a neutral, factual summary of self-tracked data for a clinician. Report averages, ranges and trends only; mark data source (manual/device). Do not interpret readings as diagnoses or suggest treatments. Turn the user\'s concerns into clear questions they can ask.',
    prompt: `${ctx.text}\n\nHealth readings (last ${body.days} days):\n${readings}\n\nUser's concerns: ${body.concerns ?? 'none given'}\nReturn JSON: {"period":string,"overview":string,"sections":[{"title":string,"points":[string]}],"questionsForDoctor":[string],"dataQualityNotes":[string]}`,
  });
});
