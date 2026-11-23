import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { communityPosts, postLikes } from '@/db/schema';
import { route, notFound } from '@/lib/http';

export const POST = route({ rate: [60, 60] }, async ({ user, params }) => {
  const [p] = await db.select().from(communityPosts).where(and(eq(communityPosts.id, params.id), eq(communityPosts.hidden, false)));
  if (!p) throw notFound();
  await db.insert(postLikes).values({ postId: p.id, userId: user.id }).onConflictDoNothing();
  return { liked: true };
});
export const DELETE = route({}, async ({ user, params }) => {
  await db.delete(postLikes).where(and(eq(postLikes.postId, params.id), eq(postLikes.userId, user.id)));
  return { liked: false };
});
