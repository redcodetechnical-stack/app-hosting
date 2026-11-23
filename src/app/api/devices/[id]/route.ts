import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { devices } from '@/db/schema';
import { route, notFound } from '@/lib/http';

export const DELETE = route({}, async ({ user, params }) => {
  const r = await db.delete(devices).where(and(eq(devices.id, params.id), eq(devices.userId, user.id))).returning();
  if (!r.length) throw notFound();
  return { ok: true };
});
