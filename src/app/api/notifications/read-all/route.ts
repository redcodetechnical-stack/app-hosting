import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { route } from '@/lib/http';

export const POST = route({}, async ({ user }) => {
  const r = await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))).returning({ id: notifications.id });
  return { ok: true, updated: r.length };
});
