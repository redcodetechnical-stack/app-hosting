import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { consents } from '@/db/schema';
import { route } from '@/lib/http';
import { audit } from '@/lib/audit';

export const GET = route({}, async ({ user }) => {
  const rows = await db.select().from(consents).where(eq(consents.userId, user.id)).orderBy(desc(consents.createdAt));
  const latest: Record<string, (typeof rows)[number]> = {};
  for (const r of rows) latest[r.purpose] ??= r;
  return { current: Object.values(latest), history: rows };
});
export const POST = route({ body: z.object({ purpose: z.string().regex(/^[a-z_]+(:[A-Z_]+)?$/).max(60), granted: z.boolean(), version: z.string().max(20).default('2026-11') }) }, async ({ user, body, ip }) => {
  const [r] = await db.insert(consents).values({ userId: user.id, ...body, ip }).returning();
  await audit(user.id, body.granted ? 'consent.grant' : 'consent.withdraw', { type: 'consent', id: r.id }, { purpose: body.purpose }, ip);
  return r;
});
