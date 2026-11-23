import { z } from 'zod';
import { db } from '@/db';
import { consents, integrations } from '@/db/schema';
import { route, ApiError, notConfigured, notFound } from '@/lib/http';
import { authorizeUrl, PROVIDERS, type Provider } from '@/lib/integrations';
import { encrypt, randomToken, sha256 } from '@/lib/crypto';
import { env } from '@/lib/env';
import { audit } from '@/lib/audit';

/** Step 1 of connecting a wearable. The user must explicitly consent to the listed data types.
 *  Returns the provider's authorize URL (redirect the user there), or connects a clearly-flagged sandbox in development. */
export const POST = route({ body: z.object({ consent: z.literal(true), sandbox: z.boolean().default(false) }), rate: [10, 600] }, async ({ user, params, body, ip }) => {
  const p = params.provider.toUpperCase() as Provider;
  const cfg = PROVIDERS[p];
  if (!cfg) throw notFound('Unknown provider');
  await db.insert(consents).values({ userId: user.id, purpose: `integration:${p}`, version: '2026-11', granted: true, ip });
  await audit(user.id, 'integration.consent', { type: 'integration', id: p }, { data: cfg.data }, ip);
  if (body.sandbox) {
    if (!env.sandbox) throw new ApiError(400, 'sandbox_disabled', 'Sandbox mode is only available in development (SANDBOX_MODE=true).');
    const [r] = await db.insert(integrations).values({ userId: user.id, provider: p, status: 'CONNECTED', sandbox: true, scopes: ['sandbox'] })
      .onConflictDoUpdate({ target: [integrations.userId, integrations.provider], set: { status: 'CONNECTED', sandbox: true, lastError: null } }).returning();
    return { connected: true, sandbox: true, integration: { provider: r.provider, status: r.status } };
  }
  if (cfg.kind === 'native') throw new ApiError(400, 'native_only', `${cfg.name} is connected from the Vitalora mobile app. ${cfg.note}`);
  if (!cfg.configured() || !cfg.auth) throw notConfigured(`${cfg.name} integration`);
  const state = randomToken(24), verifier = randomToken(48);
  await db.insert(integrations).values({ userId: user.id, provider: p, status: 'PENDING', oauthState: state, accessTokenEnc: encrypt(`pkce:${verifier}`) })
    .onConflictDoUpdate({ target: [integrations.userId, integrations.provider], set: { status: 'PENDING', oauthState: state, accessTokenEnc: encrypt(`pkce:${verifier}`), sandbox: false } });
  return { authorizeUrl: authorizeUrl(p, state, Buffer.from(sha256(verifier), 'hex').toString('base64url')) };
});
