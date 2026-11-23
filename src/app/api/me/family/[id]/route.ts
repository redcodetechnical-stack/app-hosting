import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { familyMembers } from '@/db/schema';
import { route, notFound } from '@/lib/http';

export const DELETE = route({}, async ({ user, params }) => {
  const r = await db.delete(familyMembers).where(and(eq(familyMembers.id, params.id), eq(familyMembers.ownerId, user.id))).returning();
  if (!r.length) throw notFound();
  return { ok: true };
});
