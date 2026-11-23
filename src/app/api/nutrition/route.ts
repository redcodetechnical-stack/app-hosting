import { z } from 'zod';
import { and, asc, eq, gte, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/db';
import { foodItems, nutritionLogs } from '@/db/schema';
import { route, notFound, badRequest } from '@/lib/http';
import { dayBounds, isDay } from '@/lib/dates';
import { getProfile, today } from '@/lib/wellness';
import { zIso } from '@/lib/crud';

/** One day's food log grouped by meal, with totals vs targets. */
export const GET = route({}, async ({ user, query }) => {
  const p = await getProfile(user.id);
  // List mode for sync clients: ?from=YYYY-MM-DD[&to=]
  if (isDay(query.get('from'))) {
    const s0 = dayBounds(query.get('from')!, p.timezone).start;
    const e0 = isDay(query.get('to')) ? dayBounds(query.get('to')!, p.timezone).end : new Date(Date.now() + 864e5);
    const items = await db.select().from(nutritionLogs).where(and(eq(nutritionLogs.userId, user.id), gte(nutritionLogs.eatenAt, s0), lt(nutritionLogs.eatenAt, e0))).orderBy(asc(nutritionLogs.eatenAt)).limit(2000);
    return { items };
  }
  const d = isDay(query.get('date')) ? query.get('date')! : today(p.timezone);
  const { start, end } = dayBounds(d, p.timezone);
  const rows = await db.select().from(nutritionLogs).where(and(eq(nutritionLogs.userId, user.id), gte(nutritionLogs.eatenAt, start), lt(nutritionLogs.eatenAt, end))).orderBy(asc(nutritionLogs.eatenAt));
  const tot = (k: 'calories' | 'protein' | 'carbs' | 'fat') => Math.round(rows.reduce((a, r) => a + r[k], 0));
  const w = p.weightKg ?? 65;
  return {
    date: d,
    meals: Object.fromEntries(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'].map((m) => [m, rows.filter((r) => r.meal === m)])),
    totals: { calories: tot('calories'), protein: tot('protein'), carbs: tot('carbs'), fat: tot('fat') },
    targets: { calories: p.calorieGoal, protein: Math.round(w * 1.2), carbs: Math.round((p.calorieGoal * 0.5) / 4), fat: Math.round((p.calorieGoal * 0.28) / 9) },
  };
});

const Body = z.object({
  meal: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
  quantity: z.number().min(0.1).max(20).default(1),
  eatenAt: zIso.optional(),
  foodId: z.string().optional(),
  manual: z.object({ name: z.string().trim().min(1).max(80), serving: z.string().max(40).default('1 serving'), calories: z.number().min(0).max(5000), protein: z.number().min(0).max(500).default(0), carbs: z.number().min(0).max(500).default(0), fat: z.number().min(0).max(500).default(0) }).optional(),
}).refine((b) => b.foodId || b.manual, 'Provide foodId or manual');

export const POST = route({ body: Body, rate: [120, 60] }, async ({ user, body }) => {
  let f: { name: string; serving: string; calories: number; protein: number; carbs: number; fat: number; id?: string };
  if (body.foodId) {
    const [row] = await db.select().from(foodItems).where(and(eq(foodItems.id, body.foodId), or(isNull(foodItems.ownerId), eq(foodItems.ownerId, user.id))));
    if (!row) throw notFound('Food not found');
    f = row;
  } else if (body.manual) f = body.manual;
  else throw badRequest('Provide foodId or manual');
  const q = body.quantity;
  const [r] = await db.insert(nutritionLogs).values({
    userId: user.id, foodId: f.id ?? null, name: f.name, serving: f.serving, quantity: q, meal: body.meal,
    calories: f.calories * q, protein: f.protein * q, carbs: f.carbs * q, fat: f.fat * q, eatenAt: body.eatenAt ?? new Date(), source: 'MANUAL',
  }).returning();
  return Response.json(r, { status: 201 });
});
