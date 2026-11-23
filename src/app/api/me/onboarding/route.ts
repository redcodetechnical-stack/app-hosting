import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { consents, profiles } from '@/db/schema';
import { route } from '@/lib/http';
import { suggestTargets } from '@/lib/wellness';

const Body = z.object({
  name: z.string().trim().min(1).max(60),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear() - 13),
  sex: z.enum(['FEMALE', 'MALE', 'UNSPECIFIED']),
  heightCm: z.number().min(80).max(250),
  weightKg: z.number().min(20).max(400),
  activityLevel: z.enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE']),
  goals: z.array(z.string().max(40)).max(12).default([]),
  dietPreference: z.enum(['veg', 'non_veg', 'vegan', 'jain', 'eggetarian']).optional(),
  acceptWellnessDisclaimer: z.literal(true),
  targets: z.object({ calorieGoal: z.number().int().min(1000).max(6000), waterGoalMl: z.number().int().min(500).max(8000), stepGoal: z.number().int().min(500).max(60000), sleepGoalH: z.number().min(4).max(12) }).partial().optional(),
});

/** Completes onboarding: saves the questionnaire, computes suggested targets, lets the user override them. */
export const POST = route({ body: Body }, async ({ user, body, ip }) => {
  const suggested = suggestTargets(body);
  const t = { calorieGoal: suggested.calorieGoal, waterGoalMl: suggested.waterGoalMl, stepGoal: suggested.stepGoal, sleepGoalH: suggested.sleepGoalH, ...body.targets };
  const { acceptWellnessDisclaimer: _a, targets: _t, ...rest } = body;
  const [p] = await db.update(profiles).set({ ...rest, ...t, onboardedAt: new Date() }).where(eq(profiles.userId, user.id)).returning();
  await db.insert(consents).values({ userId: user.id, purpose: 'wellness_disclaimer', version: '2026-11', granted: true, ip });
  return { profile: p, suggested };
});
