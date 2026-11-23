import { NextRequest, NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from 'jose';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { profiles, users } from '@/db/schema';
import { ApiError, json, notConfigured } from '@/lib/http';
import { configured, env } from '@/lib/env';
import { issueSession, roleId, setAuthCookies } from '@/lib/auth';
import { audit } from '@/lib/audit';

const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

async function linkOrCreate(kind: 'google' | 'apple', sub: string, email: string | null, name: string | null) {
  const col = kind === 'google' ? users.googleId : users.appleId;
  let [u] = await db.select().from(users).where(eq(col, sub));
  if (!u && email) {
    [u] = await db.select().from(users).where(eq(users.email, email));
    if (u) await db.update(users).set(kind === 'google' ? { googleId: sub, emailVerifiedAt: u.emailVerifiedAt ?? new Date() } : { appleId: sub }).where(eq(users.id, u.id));
  }
  let created = false;
  if (!u) {
    [u] = await db.insert(users).values({ email, emailVerifiedAt: email ? new Date() : null, ...(kind === 'google' ? { googleId: sub } : { appleId: sub }), roleId: await roleId('USER') }).returning();
    await db.insert(profiles).values({ userId: u.id, name });
    created = true;
  }
  if (u.status !== 'ACTIVE') throw new ApiError(403, 'account_inactive', 'This account is not active');
  await audit(u.id, created ? 'auth.register' : 'auth.login', { type: 'user', id: u.id }, { method: kind });
  return { u, created };
}

async function handle(req: NextRequest, provider: string, code: string | null, state: string | null, extra?: { user?: string }) {
  const cookieState = req.cookies.get('vt_oauth_state')?.value;
  const verifier = req.cookies.get('vt_oauth_verifier')?.value;
  if (!code || !state || state !== cookieState) return json({ error: { code: 'oauth_state', message: 'Sign-in session expired. Try again.' } }, 400);
  let sub: string, email: string | null = null, name: string | null = null;
  if (provider === 'google') {
    if (!configured.google()) throw notConfigured('Google sign-in');
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.googleClientId!, client_secret: env.googleClientSecret!, redirect_uri: `${env.appUrl}/api/auth/oauth/google/callback`, grant_type: 'authorization_code', code_verifier: verifier ?? '' }) });
    const t = await r.json();
    if (!r.ok) throw new ApiError(400, 'oauth_failed', 'Google sign-in failed');
    const { payload } = await jwtVerify(t.id_token, createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')), { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: env.googleClientId });
    sub = String(payload.sub); email = payload.email_verified ? String(payload.email).toLowerCase() : null; name = (payload.name as string) ?? null;
  } else if (provider === 'apple') {
    if (!configured.apple()) throw notConfigured('Apple sign-in');
    const key = await importPKCS8(env.applePrivateKey!.replace(/\\n/g, '\n'), 'ES256');
    const clientSecret = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: env.appleKeyId }).setIssuer(env.appleTeamId!).setIssuedAt().setExpirationTime('5m').setAudience('https://appleid.apple.com').setSubject(env.appleClientId!).sign(key);
    const r = await fetch('https://appleid.apple.com/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.appleClientId!, client_secret: clientSecret, grant_type: 'authorization_code', redirect_uri: `${env.appUrl}/api/auth/oauth/apple/callback` }) });
    const t = await r.json();
    if (!r.ok) throw new ApiError(400, 'oauth_failed', 'Apple sign-in failed');
    const { payload } = await jwtVerify(t.id_token, appleJwks, { issuer: 'https://appleid.apple.com', audience: env.appleClientId });
    sub = String(payload.sub); email = payload.email ? String(payload.email).toLowerCase() : null;
    try { const n = JSON.parse(extra?.user ?? '{}').name; name = n ? `${n.firstName ?? ''} ${n.lastName ?? ''}`.trim() : null; } catch { /* first login only */ }
  } else return json({ error: { code: 'not_found', message: 'Unknown provider' } }, 404);
  const { u, created } = await linkOrCreate(provider as 'google' | 'apple', sub, email, name);
  const session = await issueSession(u.id, req, { created });
  const body = await session.clone().json();
  const res = NextResponse.redirect(`${env.appUrl}/auth/complete${created ? '?new=1' : ''}`, 303);
  setAuthCookies(res, body.accessToken, body.refreshToken);
  res.cookies.set('vt_oauth_state', '', { path: '/api/auth/oauth', maxAge: 0 });
  res.cookies.set('vt_oauth_verifier', '', { path: '/api/auth/oauth', maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  try { const { provider } = await ctx.params; const q = req.nextUrl.searchParams; return await handle(req, provider, q.get('code'), q.get('state')); }
  catch (e) { const a = e as ApiError; return json({ error: { code: a.code ?? 'oauth_failed', message: a.message } }, a.status ?? 400); }
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) { // Apple form_post
  try { const { provider } = await ctx.params; const f = await req.formData(); return await handle(req, provider, f.get('code') as string, f.get('state') as string, { user: f.get('user') as string }); }
  catch (e) { const a = e as ApiError; return json({ error: { code: a.code ?? 'oauth_failed', message: a.message } }, a.status ?? 400); }
}
