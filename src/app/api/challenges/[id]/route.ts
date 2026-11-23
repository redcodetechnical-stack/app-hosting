import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { challengeParticipants, challenges, profiles } from '@/db/schema';
import { route, notFound, ApiError } from '@/lib/http';
import { challengeProgress } from '@/lib/gamification';
import { notify } from '@/lib/messaging';

export const GET = route({}, async ({ user, params }) => {
  const [c] = await db.select().from(challenges).where(eq(challenges.id, params.id));
  if (!c) throw notFound();
  const [me] = await db.select().from(challengeParticipants).where(and(eq(challengeParticipants.challengeId, c.id), eq(challengeParticipants.userId, user.id)));
  const progress = me ? await challengeProgress(user.id, c) : null;
  if (me && progress! >= c.target && !me.completedAt) {
    await db.update(challengeParticipants).set({ completedAt: new Date() }).where(eq(challengeParticipants.id, me.id));
    await notify({ userId: user.id, type: 'GOAL', title: 'Challenge complete', body: `You finished "${c.title}" and earned ${c.points} points.`, dedupeKey: `chal:${c.id}:${user.id}` });
  }
  let leaderboard: { name: string; progress: number; you: boolean }[] | null = null;
  if (c.community) {
    // Only participants who opted in to the leaderboard in their privacy settings are listed.
    const ps = await db.select({ userId: challengeParticipants.userId, name: profiles.name, privacy: profiles.privacy }).from(challengeParticipants).innerJoin(profiles, eq(profiles.userId, challengeParticipants.userId)).where(eq(challengeParticipants.challengeId, c.id));
    const shown = ps.filter((p) => p.privacy?.leaderboard).slice(0, 50);
    leaderboard = (await Promise.all(shown.map(async (p) => ({ name: (p.name ?? 'Member').split(' ')[0], progress: await challengeProgress(p.userId, c), you: p.userId === user.id })))).sort((a, b) => b.progress - a.progress);
  }
  return { ...c, joined: !!me, progress, percent: progress != null ? Math.min(100, Math.round((progress / c.target) * 100)) : null, leaderboard };
});
export const POST = route({}, async ({ user, params }) => { // join
  const [c] = await db.select().from(challenges).where(eq(challenges.id, params.id));
  if (!c || !c.published) throw notFound();
  if (c.endsAt < new Date()) throw new ApiError(409, 'ended', 'This challenge has ended');
  await db.insert(challengeParticipants).values({ challengeId: c.id, userId: user.id }).onConflictDoNothing();
  return { ok: true, joined: true };
});
export const DELETE = route({}, async ({ user, params }) => { // leave
  await db.delete(challengeParticipants).where(and(eq(challengeParticipants.challengeId, params.id), eq(challengeParticipants.userId, user.id)));
  return { ok: true, joined: false };
});
