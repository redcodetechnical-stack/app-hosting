import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { content } from '@/db/schema';
import { route, notFound, ApiError } from '@/lib/http';
import { currentPlan } from '@/lib/plans';

export const GET = route({}, async ({ user, params }) => {
  const [r] = await db.select().from(content).where(and(eq(content.slug, params.slug), eq(content.published, true)));
  if (!r) throw notFound();
  if (r.premium && (await currentPlan(user.id)).plan === 'FREE') throw new ApiError(402, 'upgrade_required', 'This is part of the Premium library.');
  return r;
});
