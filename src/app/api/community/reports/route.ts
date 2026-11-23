import { z } from 'zod';
import { db } from '@/db';
import { reports } from '@/db/schema';
import { route } from '@/lib/http';

export const POST = route({ body: z.object({ targetType: z.enum(['post', 'comment', 'user']), targetId: z.string(), reason: z.string().trim().min(3).max(500) }), rate: [10, 3600] }, async ({ user, body }) => {
  const [r] = await db.insert(reports).values({ reporterId: user.id, ...body }).returning();
  return Response.json({ id: r.id, status: r.status, message: 'Thanks. Our moderators will review this.' }, { status: 201 });
});
