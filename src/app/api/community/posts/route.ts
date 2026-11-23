import { z } from 'zod';
import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { comments, communityPosts, groupMembers, postLikes, profiles } from '@/db/schema';
import { route, paging, forbidden } from '@/lib/http';
import { hiddenUserIds } from '@/lib/community';

export const GET = route({}, async ({ user, query }) => {
  const { limit, offset, page } = paging(query, 50);
  const hidden = await hiddenUserIds(user.id);
  const group = query.get('groupId');
  if (group) { const [m] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, group), eq(groupMembers.userId, user.id))); if (!m) throw forbidden('Join the group to see its posts'); }
  const rows = await db.select({ p: communityPosts, author: profiles.name,
      likes: sql<number>`(select count(*)::int from ${postLikes} where ${postLikes.postId} = ${communityPosts.id})`,
      comments: sql<number>`(select count(*)::int from ${comments} where ${comments.postId} = ${communityPosts.id} and ${comments.hidden} = false)`,
      liked: sql<boolean>`exists(select 1 from ${postLikes} where ${postLikes.postId} = ${communityPosts.id} and ${postLikes.userId} = ${user.id})` })
    .from(communityPosts).leftJoin(profiles, eq(profiles.userId, communityPosts.authorId))
    .where(and(eq(communityPosts.hidden, false), group ? eq(communityPosts.groupId, group) : eq(communityPosts.visibility, 'PUBLIC'), hidden.length ? notInArray(communityPosts.authorId, hidden) : undefined))
    .orderBy(desc(communityPosts.createdAt)).limit(limit).offset(offset);
  return { items: rows.map((r) => ({ ...r.p, authorName: (r.author ?? 'Member').split(' ')[0], mine: r.p.authorId === user.id, likes: r.likes, comments: r.comments, liked: r.liked })), page, limit };
});

export const POST = route({ body: z.object({ body: z.string().trim().min(1).max(3000), groupId: z.string().optional() }), rate: [10, 600] }, async ({ user, body }) => {
  if (body.groupId) { const [m] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, body.groupId), eq(groupMembers.userId, user.id))); if (!m) throw forbidden('Join the group first'); }
  const [p] = await db.insert(communityPosts).values({ authorId: user.id, body: body.body, groupId: body.groupId ?? null, visibility: body.groupId ? 'GROUP' : 'PUBLIC' }).returning();
  return Response.json(p, { status: 201 });
});

