import { z } from 'zod';
import { route } from '@/lib/http';
import { checkAiAccess, runTool } from '@/lib/aitools';
import { userContext } from '@/lib/ai';

export const POST = route({ body: z.object({ question: z.string().max(1000).optional() }), rate: [10, 3600] }, async ({ user, body }) => {
  await checkAiAccess(user.id, ['PREMIUM', 'FAMILY']);
  const ctx = await userContext(user.id, 14);
  return runTool({
    userId: user.id, kind: 'sleep_coach', language: ctx.profile.language, json: true, input: body,
    task: 'Act as a sleep coach using CBT-I style behavioural advice (consistent wake time, stimulus control, wind-down, light, caffeine timing). Never suggest sleeping pills or supplements. If the data or question suggests loud snoring with breathing pauses, or insomnia lasting over 3 months, recommend seeing a doctor.',
    prompt: `${ctx.text}\n\nQuestion: ${body.question ?? 'How can I sleep better based on my last two weeks?'}\nReturn JSON: {"summary":string,"whatTheDataShows":[string],"plan":[{"step":string,"why":string}],"tonight":string,"seeADoctorIf":[string]}`,
  });
});
