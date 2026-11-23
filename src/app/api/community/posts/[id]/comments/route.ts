import { z } from 'zod';
import { and, asc, eq, notInArray } from 'drizzle-orm';
import { db } from '@/db';
import { comments, communityPosts, profiles } from '@/db/schema';
import { route, notFound } from '@/lib/http';
import { hiddenUserIds } from '@/lib/community';
import { notify } from '@/lib/messaging';

export const GET = route({}, async ({ user, params }) => {
  const hidden = await hiddenUserIds(user.id);
  const rows = await db.select({ c: comments, author: profiles.name }).from(comments).leftJoin(profiles, eq(profiles.userId, comments.authorId))
    .where(and(eq(comments.postId, params.id), eq(comments.hidden, false), hidden.length ? notInArray(comments.authorId, hidden) : undefined)).orderBy(asc(comments.createdAt));
  return { items: rows.map((r) => ({ ...r.c, authorName: (r.author ?? 'Member').split(' ')[0], mine: r.c.authorId === user.id })) };
});
export const POST = route({ body: z.object({ body: z.string().trim().min(1).max(1000) }), rate: [20, 600] }, async ({ user, params, body }) => {
  const [p] = await db.select().from(communityPosts).where(and(eq(communityPosts.id, params.id), eq(communityPosts.hidden, false)));
  if (!p) throw notFound();
  const [c] = await db.insert(comments).values({ postId: p.id, authorId: user.id, body: body.body }).returning();
  if (p.authorId !== user.id) await notify({ userId: p.authorId, type: 'SYSTEM', title: 'New comment', body: 'Someone commented on your post.', data: { postId: p.id }, dedupeKey: `cmt:${c.id}` });
  return Response.json(c, { status: 201 });
});
