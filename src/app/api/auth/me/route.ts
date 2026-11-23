import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { profiles, users } from '@/db/schema';
import { route } from '@/lib/http';
import { publicUser } from '@/lib/auth';
import { currentPlan } from '@/lib/plans';

export const GET = route({}, async ({ user }) => {
  const [u] = await db.select().from(users).where(eq(users.id, user.id));
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, user.id));
  const { plan, subscription } = await currentPlan(user.id);
  return { ...publicUser(u, user.role, [...user.permissions], p), plan, subscription };
});
