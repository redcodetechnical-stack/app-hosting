import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { route } from '@/lib/http';
import { configured, env } from '@/lib/env';
import { PROVIDERS } from '@/lib/integrations';

/** Configuration and health of every external service, plus connection/webhook stats. */
export const GET = route({ perm: 'integrations.read' }, async () => {
  const conns = (await db.execute(sql`select provider, status, count(*)::int n, max(last_sync_at) last_sync from integrations group by 1,2`)).rows;
  const hooks = (await db.execute(sql`select provider, count(*)::int total, count(*) filter (where error is not null)::int failed, max(created_at) last from webhook_events where created_at > now()-interval '7 days' group by 1`)).rows;
  return {
    services: { ai: { configured: configured.ai(), provider: env.aiProvider }, googleSignIn: configured.google(), appleSignIn: configured.apple(), sms: configured.sms(), email: configured.email(), push: configured.push(), payments: { configured: configured.payments(), provider: env.paymentProvider }, nutritionix: configured.nutritionix(), edamam: configured.edamam(), openFoodFacts: env.openFoodFacts, cloudinary: configured.cloudinary(), video: configured.video(), maps: configured.maps(), redis: configured.redis() },
    wearables: Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, { configured: v.configured(), kind: v.kind }])),
    connections: conns, webhooks7d: hooks, sandboxMode: env.sandbox,
  };
});
