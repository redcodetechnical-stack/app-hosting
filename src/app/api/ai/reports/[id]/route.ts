import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { aiReports } from '@/db/schema';
import { route, notFound } from '@/lib/http';

export const DELETE = route({}, async ({ user, params }) => {
  const r = await db.delete(aiReports).where(and(eq(aiReports.id, params.id), eq(aiReports.userId, user.id))).returning();
  if (!r.length) throw notFound();
  return { ok: true };
});
