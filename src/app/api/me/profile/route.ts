import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { profiles } from '@/db/schema';
import { route } from '@/lib/http';
import { getProfile } from '@/lib/wellness';
import { zTime } from '@/lib/crud';

const ProfilePatch = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear() - 13).optional(),
  sex: z.enum(['FEMALE', 'MALE', 'UNSPECIFIED']).optional(),
  heightCm: z.number().min(80).max(250).optional(),
  weightKg: z.number().min(20).max(400).optional(),
  activityLevel: z.enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE']).optional(),
  goals: z.array(z.string().max(40)).max(12).optional(),
  dietPreference: z.enum(['veg', 'non_veg', 'vegan', 'jain', 'eggetarian']).nullable().optional(),
  language: z.enum(['en', 'hi']).optional(),
  timezone: z.string().max(60).refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Unknown time zone').optional(),
  calorieGoal: z.number().int().min(1000).max(6000).optional(),
  waterGoalMl: z.number().int().min(500).max(8000).optional(),
  stepGoal: z.number().int().min(500).max(60000).optional(),
  sleepGoalH: z.number().min(4).max(12).optional(),
  glassSizesMl: z.array(z.number().int().min(50).max(2000)).min(1).max(6).optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  privacy: z.object({ profileVisible: z.boolean(), leaderboard: z.boolean() }).optional(),
  notifyPrefs: z.object({ water: z.object({ on: z.boolean(), everyH: z.number().min(0.5).max(6) }), bedtime: zTime.nullable(), workout: zTime.nullable(), meditation: zTime.nullable(), email: z.boolean(), push: z.boolean(), sms: z.boolean() }).optional(),
});

export const GET = route({}, async ({ user }) => getProfile(user.id));
export const PATCH = route({ body: ProfilePatch }, async ({ user, body }) => {
  const [p] = await db.update(profiles).set(body).where(eq(profiles.userId, user.id)).returning();
  return p;
});
