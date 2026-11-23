import { route } from '@/lib/http';
import { checkAiAccess, runTool } from '@/lib/aitools';
import { userContext } from '@/lib/ai';
import { wellnessScore } from '@/lib/wellness';

/** AI weekly health report: highlights, patterns, and 3 focus actions for next week, grounded in computed stats. */
export const POST = route({ rate: [10, 3600] }, async ({ user }) => {
  await checkAiAccess(user.id);
  const ctx = await userContext(user.id, 7);
  const p = ctx.profile;
  const st = Object.values(ctx.stats);
  const scores = st.map((s) => wellnessScore(s, { stepGoal: p.stepGoal, waterGoalMl: p.waterGoalMl, sleepGoalH: p.sleepGoalH }).score).filter((x): x is number => x != null);
  const facts = { avgScore: scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null, totalSteps: st.reduce((a, s) => a + s.steps, 0), activeMin: st.reduce((a, s) => a + s.activeMin, 0), waterGoalDays: st.filter((s) => s.waterMl >= p.waterGoalMl).length, nightsLogged: st.filter((s) => s.sleepH != null).length, meditationMin: st.reduce((a, s) => a + s.meditationMin, 0) };
  const r = await runTool<{ headline: string; wins: string[]; watchouts: string[]; patterns: string[]; focusNextWeek: string[] }>({
    userId: user.id, kind: 'weekly_report', language: p.language, json: true, input: facts,
    task: 'Write a short, encouraging weekly wellness report. Use only the numbers provided. Mention missing data plainly.',
    prompt: `${ctx.text}\n\nComputed facts: ${JSON.stringify(facts)}\nReturn JSON: {"headline":string,"wins":[string],"watchouts":[string],"patterns":[string],"focusNextWeek":[string,string,string]}`,
  });
  return { ...r, facts };
});
