import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { journalEntries } from '@/db/schema';
import { route, notFound } from '@/lib/http';
import { checkAiAccess, runTool } from '@/lib/aitools';
import { CRISIS_REPLY, detectCrisis } from '@/lib/ai';
import { decrypt } from '@/lib/crypto';
import { getProfile } from '@/lib/wellness';

export const POST = route({ body: z.object({ entryId: z.string() }), rate: [15, 3600] }, async ({ user, body }) => {
  const [e] = await db.select().from(journalEntries).where(and(eq(journalEntries.id, body.entryId), eq(journalEntries.userId, user.id)));
  if (!e) throw notFound('Journal entry not found');
  const text = decrypt(e.bodyEnc) ?? '';
  const p = await getProfile(user.id);
  if (detectCrisis(text)) return { crisis: true, output: CRISIS_REPLY[p.language === 'hi' ? 'hi' : 'en'] };
  await checkAiAccess(user.id, ['PREMIUM', 'FAMILY']);
  return runTool({
    userId: user.id, kind: 'journal_reflection', language: p.language, json: true, input: { entryId: e.id },
    task: 'Reflect a journal entry back kindly, like a supportive listener. Name the feelings you notice, ask gentle questions, never interpret it as a disorder or give a psychological diagnosis. Do not invent causes the writer did not state.',
    prompt: `Journal (${e.kind.toLowerCase()}):\n"""${text.slice(0, 6000)}"""\nReturn JSON: {"feelingsNoticed":[string],"reflection":string,"questionsToConsider":[string],"oneKindThing":string}`,
  });
});
