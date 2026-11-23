import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { integrations } from '@/db/schema';
import { route, ApiError, notFound } from '@/lib/http';
import { findIntegration, syncProvider, type Provider } from '@/lib/integrations';

export const POST = route({ rate: [6, 600] }, async ({ user, params }) => {
  const row = await findIntegration(user.id, params.provider.toUpperCase() as Provider);
  if (!row) throw notFound('Not connected');
  if (row.status !== 'CONNECTED') throw new ApiError(409, 'not_connected', 'Connect this device first');
  try { return { ok: true, synced: await syncProvider(row) }; }
  catch (e) {
    await db.update(integrations).set({ status: (e as ApiError).status === 401 ? 'ERROR' : row.status, lastError: (e as Error).message }).where(eq(integrations.id, row.id));
    throw e;
  }
});
