import { z } from 'zod';
import { and, asc, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { foodItems } from '@/db/schema';
import { route } from '@/lib/http';
import { offSearch } from '@/lib/external';

/** Search: Vitalora's curated list + the user's own custom foods, then Open Food Facts for packaged foods (source labelled). */
export const GET = route({ rate: [60, 60] }, async ({ user, query }) => {
  const q = query.get('q')?.trim() ?? '';
  const local = await db.select().from(foodItems)
    .where(and(q ? ilike(foodItems.name, `%${q}%`) : undefined, or(isNull(foodItems.ownerId), eq(foodItems.ownerId, user.id))))
    .orderBy(asc(foodItems.name)).limit(25);
  const external = q.length >= 3 && query.get('external') !== 'false' && local.length < 8 ? await offSearch(q) : [];
  return { items: local, external, note: 'Values are per serving; Vitalora items are typical estimates.' };
});

export const POST = route({ body: z.object({ name: z.string().trim().min(1).max(80), serving: z.string().trim().min(1).max(40), calories: z.number().min(0).max(5000), protein: z.number().min(0).max(500), carbs: z.number().min(0).max(500), fat: z.number().min(0).max(500), fiber: z.number().min(0).max(200).optional(), barcode: z.string().max(32).optional() }) }, async ({ user, body }) => {
  const [r] = await db.insert(foodItems).values({ ...body, ownerId: user.id, source: 'custom' }).returning();
  return Response.json(r, { status: 201 });
});
