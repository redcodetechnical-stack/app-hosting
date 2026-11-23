import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { content } from '@/db/schema';
import { route } from '@/lib/http';
import { currentPlan } from '@/lib/plans';

/** Published library: ?type=MEDITATION|WORKOUT_PROGRAM|ARTICLE|RESOURCE|BANNER|SLEEP_SOUND|RECIPE. Premium bodies are locked on Free. */
export const GET = route({}, async ({ user, query }) => {
  const type = query.get('type');
  const rows = await db.select().from(content).where(and(eq(content.published, true), type ? eq(content.type, type as never) : undefined)).orderBy(asc(content.title));
  const { plan } = await currentPlan(user.id);
  return { items: rows.map((r) => (r.premium && plan === 'FREE' ? { ...r, body: null, mediaUrl: null, locked: true } : { ...r, locked: false })) };
});
