import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { sessions } from '@/db/schema';
import { route } from '@/lib/http';

export const GET = route({}, async ({ user }) => {
  const rows = await db.select({ id: sessions.id, userAgent: sessions.userAgent, ip: sessions.ip, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt })
    .from(sessions).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()))).orderBy(desc(sessions.createdAt));
  return { items: rows };
});
