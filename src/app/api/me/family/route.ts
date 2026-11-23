import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { familyMembers, users } from '@/db/schema';
import { route, ApiError } from '@/lib/http';
import { requirePlan, PLANS } from '@/lib/plans';
import { dayStats, getProfile, lastNDays } from '@/lib/wellness';

export const GET = route({}, async ({ user }) => {
  const rows = await db.select().from(familyMembers).where(eq(familyMembers.ownerId, user.id));
  const tz = (await getProfile(user.id)).timezone;
  const days = lastNDays(7, tz);
  // Family insights only for members who linked their own account (they accepted the invite).
  const members = await Promise.all(rows.map(async (m) => {
    if (!m.memberId) return { ...m, linked: false, week: null };
    const st = Object.values(await dayStats(m.memberId, tz, days));
    return { ...m, linked: true, week: { steps: st.reduce((a, s) => a + s.steps, 0), activeMin: st.reduce((a, s) => a + s.activeMin, 0), waterDays: st.filter((s) => s.waterMl > 0).length } };
  }));
  return { items: members };
});
export const POST = route({ body: z.object({ displayName: z.string().trim().min(1).max(40), inviteEmail: z.string().email().toLowerCase().optional() }) }, async ({ user, body }) => {
  await requirePlan(user.id, 'FAMILY');
  const rows = await db.select().from(familyMembers).where(eq(familyMembers.ownerId, user.id));
  if (rows.length >= PLANS.FAMILY.limits.familyProfiles) throw new ApiError(400, 'limit_reached', 'The Family plan includes up to 5 profiles');
  let memberId: string | null = null;
  if (body.inviteEmail) { const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.inviteEmail)); memberId = u?.id ?? null; }
  const [m] = await db.insert(familyMembers).values({ ownerId: user.id, displayName: body.displayName, inviteEmail: body.inviteEmail, memberId: null }).returning();
  return Response.json({ ...m, inviteSent: !!body.inviteEmail, existingAccount: !!memberId }, { status: 201 });
});
