import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { integrations } from '@/db/schema';
import { route } from '@/lib/http';
import { PROVIDERS, type Provider } from '@/lib/integrations';
import { env } from '@/lib/env';

export const GET = route({}, async ({ user }) => {
  const rows = await db.select().from(integrations).where(eq(integrations.userId, user.id));
  return {
    sandboxAvailable: env.sandbox,
    items: (Object.keys(PROVIDERS) as Provider[]).map((k) => {
      const r = rows.find((x) => x.provider === k);
      return { provider: k, name: PROVIDERS[k].name, kind: PROVIDERS[k].kind, data: PROVIDERS[k].data, note: PROVIDERS[k].note, serverConfigured: PROVIDERS[k].configured(),
        status: r?.status ?? 'DISCONNECTED', sandbox: r?.sandbox ?? false, lastSyncAt: r?.lastSyncAt ?? null, lastError: r?.lastError ?? null, scopes: r?.scopes ?? [] };
    }),
  };
});
