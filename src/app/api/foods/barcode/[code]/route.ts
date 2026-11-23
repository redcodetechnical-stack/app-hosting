import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { foodItems } from '@/db/schema';
import { route, notFound, badRequest } from '@/lib/http';
import { barcodeLookup } from '@/lib/external';

/** Barcode scanner backend: local cache first, then Nutritionix / Open Food Facts; found items are cached. */
export const GET = route({ rate: [30, 60] }, async ({ params }) => {
  if (!/^\d{6,14}$/.test(params.code)) throw badRequest('Barcode must be 6-14 digits');
  const [hit] = await db.select().from(foodItems).where(eq(foodItems.barcode, params.code));
  if (hit) return hit;
  const f = await barcodeLookup(params.code);
  if (!f) throw notFound('No product found for this barcode');
  const [row] = await db.insert(foodItems).values({ name: f.name, serving: f.serving, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber ?? null, barcode: f.barcode, source: f.source }).onConflictDoNothing().returning();
  return row ?? f;
});
