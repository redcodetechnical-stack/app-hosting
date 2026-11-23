import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { familyMembers } from '@/db/schema';
import { route, notFound } from '@/lib/http';

/** An invited person (signed in with the invited email) accepts, which links their account to the family. */
export const POST = route({ body: z.object({ inviteId: z.string() }) }, async ({ user, body }) => {
  if (!user.email) throw notFound('No invite for this account');
  const [m] = await db.update(familyMembers).set({ memberId: user.id })
    .where(and(eq(familyMembers.id, body.inviteId), eq(familyMembers.inviteEmail, user.email), isNull(familyMembers.memberId))).returning();
  if (!m) throw notFound('Invite not found');
  return { ok: true, familyOwnerId: m.ownerId };
});
