import { z } from 'zod';
import { route } from '@/lib/http';
import { checkAiAccess, runTool } from '@/lib/aitools';
import { userContext } from '@/lib/ai';
import { db } from '@/db';
import { workoutPlans } from '@/db/schema';

const TYPES = ['WALK', 'RUN', 'CYCLE', 'STRENGTH', 'YOGA', 'HIIT', 'CARDIO', 'SWIM', 'OTHER'];
const Body = z.object({ daysPerWeek: z.number().int().min(1).max(7).default(4), minutesPerSession: z.number().int().min(10).max(120).default(30), level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'), equipment: z.array(z.string().max(30)).max(10).default(['none']), focus: z.string().max(80).optional(), limitations: z.string().max(200).optional(), apply: z.boolean().default(false) });

export const POST = route({ body: Body, rate: [10, 3600] }, async ({ user, body }) => {
  await checkAiAccess(user.id, ['PREMIUM', 'FAMILY']);
  const ctx = await userContext(user.id);
  const r = await runTool<{ week: { weekday: number; type: string; minutes: number; title: string; exercises: { name: string; sets?: number; reps?: string; durationSec?: number; notes?: string }[] }[]; warmup: string; cooldown: string; progression: string }>({
    userId: user.id, kind: 'workout_plan', language: ctx.profile.language, json: true, input: body, maxTokens: 3000,
    task: 'Design a safe weekly workout plan for a general adult. Include warm-up and cool-down. If limitations are given, avoid aggravating movements and suggest checking with a physiotherapist or doctor. weekday is 0=Sunday..6=Saturday; type must be one of ' + TYPES.join(', ') + '.',
    prompt: `${ctx.text}\n\nRequest: ${body.daysPerWeek} days/week, ${body.minutesPerSession} min, ${body.level}, equipment: ${body.equipment.join(', ')}, focus: ${body.focus ?? 'general fitness'}, limitations: ${body.limitations ?? 'none stated'}.\nReturn JSON: {"week":[{"weekday":1,"type":"STRENGTH","minutes":30,"title":string,"exercises":[{"name":string,"sets":3,"reps":"10-12","durationSec":null,"notes":string}]}],"warmup":string,"cooldown":string,"progression":string}`,
  });
  let applied = 0;
  if (body.apply && Array.isArray(r.output?.week)) {
    for (const d of r.output.week) {
      if (!(d.weekday >= 0 && d.weekday <= 6) || !TYPES.includes(d.type)) continue;
      await db.insert(workoutPlans).values({ userId: user.id, weekday: d.weekday, type: d.type as never, minutes: Math.min(300, Math.max(5, d.minutes | 0)) })
        .onConflictDoUpdate({ target: [workoutPlans.userId, workoutPlans.weekday], set: { type: d.type as never, minutes: Math.min(300, Math.max(5, d.minutes | 0)) } });
      applied++;
    }
  }
  return { ...r, appliedToWeeklyPlan: applied };
});
