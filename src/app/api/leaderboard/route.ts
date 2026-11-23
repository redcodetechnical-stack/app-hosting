import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { profiles, users } from '@/db/schema';
import { route } from '@/lib/http';
import { weeklyPoints } from '@/lib/gamification';

/** Opt-in weekly points leaderboard (profiles.privacy.leaderboard = true). Shows first names only. */
export const GET = route({}, async ({ user }) => {
  const ps = await db.select({ userId: profiles.userId, name: profiles.name }).from(profiles).innerJoin(users, eq(users.id, profiles.userId))
    .where(sql`${profiles.privacy}->>'leaderboard' = 'true' and ${users.status} = 'ACTIVE'`).limit(200);
  const rows = await Promise.all(ps.map(async (p) => ({ name: (p.name ?? 'Member').split(' ')[0], points: await weeklyPoints(p.userId), you: p.userId === user.id })));
  return { items: rows.sort((a, b) => b.points - a.points).slice(0, 50), optedIn: ps.some((p) => p.userId === user.id) };
});
