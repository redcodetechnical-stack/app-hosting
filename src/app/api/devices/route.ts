import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { devices } from '@/db/schema';
import { route } from '@/lib/http';

export const GET = route({}, async ({ user }) => ({ items: await db.select().from(devices).where(eq(devices.userId, user.id)).orderBy(desc(devices.lastSeenAt)) }));
export const POST = route({ body: z.object({ platform: z.enum(['web', 'android', 'ios']), pushToken: z.string().min(10).max(4096).optional(), name: z.string().max(80).optional() }) }, async ({ user, body }) => {
  if (body.pushToken) {
    const [r] = await db.insert(devices).values({ userId: user.id, ...body }).onConflictDoUpdate({ target: devices.pushToken, set: { userId: user.id, lastSeenAt: new Date(), name: body.name, platform: body.platform } }).returning();
    return r;
  }
  const [r] = await db.insert(devices).values({ userId: user.id, ...body }).returning();
  return r;
});
