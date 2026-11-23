import { z } from 'zod';
import { db } from '@/db';
import { systemSettings } from '@/db/schema';
import { route } from '@/lib/http';
import { audit } from '@/lib/audit';

export const GET = route({ perm: 'system.manage' }, async () => ({ items: await db.select().from(systemSettings) }));
export const PUT = route({ perm: 'system.manage', body: z.object({ key: z.string().regex(/^[a-z0-9_.]{2,60}$/), value: z.unknown() }) }, async ({ user, body, ip }) => {
  const [r] = await db.insert(systemSettings).values({ key: body.key, value: body.value as never }).onConflictDoUpdate({ target: systemSettings.key, set: { value: body.value as never } }).returning();
  await audit(user.id, 'admin.setting', { type: 'setting', id: body.key }, undefined, ip);
  return r;
});
