import { z } from 'zod';
import { route } from '@/lib/http';
import { checkAiAccess, runTool } from '@/lib/aitools';
import { getProfile } from '@/lib/wellness';

/** Explains the terms on a lab report in plain language. It does not diagnose; any value flagged outside the lab's own range is a question for the doctor. */
export const POST = route({ body: z.object({ reportText: z.string().trim().min(10).max(12000) }), rate: [5, 3600] }, async ({ user, body }) => {
  await checkAiAccess(user.id, ['PREMIUM', 'FAMILY']);
  const p = await getProfile(user.id);
  return runTool({
    userId: user.id, kind: 'lab_explainer', language: p.language, json: true, input: { chars: body.reportText.length }, maxTokens: 3000,
    task: "Explain what each test on a lab report measures, in plain language. Use the reference range printed on the report itself; if a value is outside that printed range, say only that it is outside the lab's range and should be discussed with the doctor who ordered it. Never name a disease the person has, never suggest medicines or doses. Flag urgent-looking values (if the report marks them critical) with advice to contact a doctor promptly.",
    prompt: `Lab report text:\n"""${body.reportText}"""\nReturn JSON: {"tests":[{"name":string,"whatItMeasures":string,"yourValue":string,"labRange":string,"status":"within_range"|"outside_range"|"no_range_given","note":string}],"questionsForDoctor":[string],"urgent":boolean}`,
  });
});
