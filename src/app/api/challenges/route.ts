import { and, asc, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import { challengeParticipants, challenges } from '@/db/schema';
import { route } from '@/lib/http';
import { challengeProgress } from '@/lib/gamification';

export const GET = route({}, async ({ user }) => {
  const cs = await db.select().from(challenges).where(and(eq(challenges.published, true), gte(challenges.endsAt, new Date()))).orderBy(asc(challenges.endsAt));
  const mine = await db.select().from(challengeParticipants).where(eq(challengeParticipants.userId, user.id));
  return { items: await Promise.all(cs.map(async (c) => { const j = mine.find((m) => m.challengeId === c.id); const progress = j ? await challengeProgress(user.id, c) : null; return { ...c, joined: !!j, completedAt: j?.completedAt ?? null, progress, percent: progress != null ? Math.min(100, Math.round((progress / c.target) * 100)) : null }; })) };
});
