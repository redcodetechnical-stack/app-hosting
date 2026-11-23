import { z } from 'zod';
import { route } from '@/lib/http';
import { checkAiAccess, runTool } from '@/lib/aitools';
import { CRISIS_REPLY, detectCrisis, userContext } from '@/lib/ai';

export const POST = route({ body: z.object({ situation: z.string().trim().min(3).max(2000), minutesAvailable: z.number().int().min(1).max(60).default(5) }), rate: [15, 3600] }, async ({ user, body }) => {
  const ctx = await userContext(user.id, 7);
  if (detectCrisis(body.situation)) return { crisis: true, output: CRISIS_REPLY[ctx.profile.language === 'hi' ? 'hi' : 'en'] };
  await checkAiAccess(user.id);
  return runTool({
    userId: user.id, kind: 'stress_coach', language: ctx.profile.language, json: true, input: { minutes: body.minutesAvailable },
    task: 'Offer a brief, evidence-based stress reset (paced breathing, grounding, reframing, a small next action). Validate feelings without diagnosing. Suggest professional support if stress is persistent or overwhelming.',
    prompt: `${ctx.text}\n\nSituation: ${body.situation}\nTime available: ${body.minutesAvailable} min.\nReturn JSON: {"acknowledge":string,"reset":[{"step":string,"seconds":number}],"reframe":string,"nextSmallAction":string,"ifThisKeepsHappening":string}`,
  });
});
