import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { integrations } from '@/db/schema';
import { exchangeCode, PROVIDERS, syncProvider, type Provider } from '@/lib/integrations';
import { decrypt, encrypt } from '@/lib/crypto';
import { env } from '@/lib/env';

/** OAuth redirect target. Validates state, exchanges the code (PKCE), stores encrypted tokens, runs a first sync. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const p = provider.toUpperCase() as Provider;
  const q = req.nextUrl.searchParams;
  const back = (status: string) => NextResponse.redirect(`${env.appUrl}/settings/connected-devices?provider=${p}&status=${status}`, 303);
  if (!PROVIDERS[p]) return back('unknown_provider');
  const state = q.get('state'), code = q.get('code');
  if (!state) return back('invalid_state');
  const [row] = await db.select().from(integrations).where(eq(integrations.oauthState, state));
  if (!row || row.provider !== p) return back('invalid_state');
  if (q.get('error') || !code) { await db.update(integrations).set({ status: 'DISCONNECTED', oauthState: null }).where(eq(integrations.id, row.id)); return back('denied'); }
  try {
    const verifier = (decrypt(row.accessTokenEnc) ?? '').replace(/^pkce:/, '');
    const t = await exchangeCode(p, code, verifier);
    const [saved] = await db.update(integrations).set({ status: 'CONNECTED', oauthState: null, accessTokenEnc: encrypt(t.access_token), refreshTokenEnc: encrypt(t.refresh_token ?? null), tokenExpiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null, externalUserId: t.user_id ?? null, scopes: t.scope?.split(/[ ,]/) ?? [], lastError: null }).where(eq(integrations.id, row.id)).returning();
    syncProvider(saved).catch(async (e) => db.update(integrations).set({ lastError: String(e.message) }).where(eq(integrations.id, row.id)));
    return back('connected');
  } catch (e) {
    await db.update(integrations).set({ status: 'ERROR', oauthState: null, lastError: String((e as Error).message) }).where(eq(integrations.id, row.id));
    return back('error');
  }
}
