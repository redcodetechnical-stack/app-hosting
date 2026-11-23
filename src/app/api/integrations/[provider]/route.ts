import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { consents, integrations } from '@/db/schema';
import { route, notFound } from '@/lib/http';
import { audit } from '@/lib/audit';

/** Disconnect: deletes stored tokens and records consent withdrawal. ?purge=true also deletes data imported from this device. */
export const DELETE = route({}, async ({ user, params, query, ip }) => {
  const p = params.provider.toUpperCase();
  const r = await db.delete(integrations).where(and(eq(integrations.userId, user.id), eq(integrations.provider, p as never))).returning();
  if (!r.length) throw notFound('Not connected');
  await db.insert(consents).values({ userId: user.id, purpose: `integration:${p}`, version: '2026-11', granted: false, ip });
  let purged = false;
  const others = await db.select({ id: integrations.id }).from(integrations).where(and(eq(integrations.userId, user.id), eq(integrations.status, 'CONNECTED')));
  // Device rows are not tagged per provider, so purge only when no other device source is still connected.
  if (query.get('purge') === 'true' && !others.length) {
    purged = true;
    const { activityLogs, sleepLogs } = await import('@/db/schema');
    await db.delete(activityLogs).where(and(eq(activityLogs.userId, user.id), eq(activityLogs.source, 'DEVICE')));
    await db.delete(sleepLogs).where(and(eq(sleepLogs.userId, user.id), eq(sleepLogs.source, 'DEVICE')));
  }
  await audit(user.id, 'integration.disconnect', { type: 'integration', id: p }, { purge: purged }, ip);
  return { ok: true, purgedDeviceData: purged, ...(query.get('purge') === 'true' && !purged ? { note: 'Device data kept because another device source is still connected.' } : {}) };
});
