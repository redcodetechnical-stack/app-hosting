import { z } from 'zod';
import * as s from '@/db/schema';
import { adminCrud } from './admincrud';
import { zIso } from './crud';

const ContentBody = z.object({ type: z.enum(['MEDITATION', 'WORKOUT_PROGRAM', 'ARTICLE', 'RESOURCE', 'BANNER', 'SLEEP_SOUND', 'RECIPE']), slug: z.string().regex(/^[a-z0-9-]{3,80}$/), title: z.string().min(2).max(140), summary: z.string().max(400).optional(), body: z.string().max(50000).optional(), category: z.string().max(40).optional(), level: z.string().max(30).optional(), durationMin: z.number().int().min(1).max(600).optional(), mediaUrl: z.string().url().optional(), premium: z.boolean().default(false), published: z.boolean().default(false) });
export const contentAdmin = adminCrud({ table: s.content, perm: 'content.manage', name: 'content', create: ContentBody, update: ContentBody.partial(), order: s.content.updatedAt });

const ChallengeBody = z.object({ title: z.string().min(3).max(100), description: z.string().min(3).max(500), metric: z.enum(['STEPS', 'WATER_ML', 'ACTIVE_MINUTES', 'MEDITATION_MINUTES', 'SLEEP_NIGHTS', 'HABIT_COMPLETIONS']), target: z.number().int().min(1), startsAt: zIso, endsAt: zIso, community: z.boolean().default(false), points: z.number().int().min(0).max(1000).default(50), published: z.boolean().default(true) });
export const challengeAdmin = adminCrud({ table: s.challenges, perm: 'content.manage', name: 'challenge', create: ChallengeBody.refine((b) => b.endsAt > b.startsAt, 'endsAt must be after startsAt'), update: ChallengeBody.partial(), order: s.challenges.createdAt });

const CouponBody = z.object({ code: z.string().regex(/^[A-Z0-9_-]{3,30}$/), percentOff: z.number().int().min(1).max(100).optional(), amountOffPaise: z.number().int().min(100).optional(), plans: z.array(z.enum(['PREMIUM', 'FAMILY'])).default([]), maxUses: z.number().int().min(1).optional(), expiresAt: zIso.optional(), active: z.boolean().default(true) });
export const couponAdmin = adminCrud({ table: s.coupons, perm: 'coupons.manage', name: 'coupon', create: CouponBody.refine((b) => !!b.percentOff !== !!b.amountOffPaise, 'Set exactly one of percentOff or amountOffPaise'), update: CouponBody.partial(), order: s.coupons.createdAt });

const ExerciseBody = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,80}$/), name: z.string().min(2).max(80), category: z.enum(['Strength', 'Cardio', 'HIIT', 'Yoga', 'Mobility']), muscles: z.string().max(120), instructions: z.array(z.string().max(300)).min(1).max(12), mediaUrl: z.string().url().optional(), published: z.boolean().default(true) });
export const exerciseAdmin = adminCrud({ table: s.exercises, perm: 'content.manage', name: 'exercise', create: ExerciseBody, update: ExerciseBody.partial(), order: s.exercises.updatedAt });

const FoodBody = z.object({ name: z.string().min(1).max(80), serving: z.string().min(1).max(40), calories: z.number().min(0).max(5000), protein: z.number().min(0), carbs: z.number().min(0), fat: z.number().min(0), fiber: z.number().min(0).optional(), barcode: z.string().max(32).optional() });
export const foodAdmin = adminCrud({ table: s.foodItems, perm: 'content.manage', name: 'food', create: FoodBody, update: FoodBody.partial(), order: s.foodItems.createdAt, prep: (b) => ({ ...b, source: 'vitalora' }) });
