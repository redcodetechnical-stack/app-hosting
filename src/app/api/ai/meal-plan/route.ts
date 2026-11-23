import { z } from 'zod';
import { route } from '@/lib/http';
import { checkAiAccess, runTool } from '@/lib/aitools';
import { userContext } from '@/lib/ai';
import { db } from '@/db';
import { groceryItems } from '@/db/schema';

const Body = z.object({ days: z.number().int().min(1).max(7).default(3), diet: z.enum(['veg', 'non_veg', 'vegan', 'jain', 'eggetarian']).optional(), cuisine: z.string().max(40).default('Indian'), calorieTarget: z.number().int().min(1000).max(5000).optional(), avoid: z.array(z.string().max(40)).max(15).default([]), budget: z.enum(['low', 'medium', 'high']).default('medium'), addGroceries: z.boolean().default(false) });

export const POST = route({ body: Body, rate: [10, 3600] }, async ({ user, body }) => {
  await checkAiAccess(user.id, ['PREMIUM', 'FAMILY']);
  const ctx = await userContext(user.id);
  const diet = body.diet ?? ctx.profile.dietPreference ?? 'veg';
  const kcal = body.calorieTarget ?? ctx.profile.calorieGoal;
  const r = await runTool<{ days: { day: number; meals: { meal: string; dish: string; portion: string; calories: number; protein: number }[]; totalCalories: number }[]; groceries: string[]; tips: string[] }>({
    userId: user.id, kind: 'meal_plan', language: ctx.profile.language, json: true, input: { ...body, diet, kcal }, maxTokens: 3500,
    task: 'Create a practical, home-cookable meal plan. Respect the diet type strictly (jain: no onion, garlic, root vegetables; vegan: no dairy/eggs). Avoid listed foods (treat them as allergies/intolerances). Hit protein reasonably. Do not promise weight-loss results.',
    prompt: `${ctx.text}\n\nPlan: ${body.days} day(s), ${diet}, ${body.cuisine} cuisine, about ${kcal} kcal/day, budget ${body.budget}, avoid: ${body.avoid.join(', ') || 'nothing'}.\nReturn JSON: {"days":[{"day":1,"meals":[{"meal":"Breakfast|Lunch|Snack|Dinner","dish":string,"portion":string,"calories":number,"protein":number}],"totalCalories":number}],"groceries":[string],"tips":[string]}`,
  });
  if (body.addGroceries && Array.isArray(r.output?.groceries) && r.output.groceries.length)
    await db.insert(groceryItems).values(r.output.groceries.slice(0, 40).map((g) => ({ userId: user.id, text: String(g).slice(0, 80) })));
  return r;
});
