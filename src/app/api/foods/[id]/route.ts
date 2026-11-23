import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { foodItems } from '@/db/schema';
import { route, notFound } from '@/lib/http';

export const DELETE = route({}, async ({ user, params }) => {
  const r = await db.delete(foodItems).where(and(eq(foodItems.id, params.id), eq(foodItems.ownerId, user.id))).returning();
  if (!r.length) throw notFound('Custom food not found');
  return { ok: true };
});
