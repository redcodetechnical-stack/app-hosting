import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { nutritionLogs } from '@/db/schema';
import { route, notFound } from '@/lib/http';

export const PATCH = route({ body: z.object({ quantity: z.number().min(0.1).max(20).optional(), meal: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']).optional() }) }, async ({ user, params, body }) => {
  const [ex] = await db.select().from(nutritionLogs).where(and(eq(nutritionLogs.id, params.id), eq(nutritionLogs.userId, user.id)));
  if (!ex) throw notFound();
  const k = body.quantity ? body.quantity / ex.quantity : 1;
  const [r] = await db.update(nutritionLogs).set({ ...body, calories: ex.calories * k, protein: ex.protein * k, carbs: ex.carbs * k, fat: ex.fat * k }).where(eq(nutritionLogs.id, ex.id)).returning();
  return r;
});
export const DELETE = route({}, async ({ user, params }) => {
  const r = await db.delete(nutritionLogs).where(and(eq(nutritionLogs.id, params.id), eq(nutritionLogs.userId, user.id))).returning();
  if (!r.length) throw notFound();
  return { ok: true };
});
