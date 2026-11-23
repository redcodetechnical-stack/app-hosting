import { NextResponse } from 'next/server';
import { route, notConfigured, notFound } from '@/lib/http';
import { configured, env } from '@/lib/env';
import { randomToken, sha256 } from '@/lib/crypto';

/** Starts Google or Apple sign-in. State + PKCE verifier are kept in short-lived httpOnly cookies. */
export const GET = route({ auth: false, rate: [30, 300] }, async ({ params }) => {
  const p = params.provider;
  const state = randomToken(24), verifier = randomToken(48);
  const challenge = Buffer.from(sha256(verifier), 'hex').toString('base64url');
  let url: URL;
  if (p === 'google') {
    if (!configured.google()) throw notConfigured('Google sign-in');
    url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: env.googleClientId!, redirect_uri: `${env.appUrl}/api/auth/oauth/google/callback`, response_type: 'code', scope: 'openid email profile', state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' }).toString();
  } else if (p === 'apple') {
    if (!configured.apple()) throw notConfigured('Apple sign-in');
    url = new URL('https://appleid.apple.com/auth/authorize');
    url.search = new URLSearchParams({ client_id: env.appleClientId!, redirect_uri: `${env.appUrl}/api/auth/oauth/apple/callback`, response_type: 'code', response_mode: 'form_post', scope: 'name email', state }).toString();
  } else throw notFound('Unknown sign-in provider');
  const res = NextResponse.redirect(url.toString());
  const opts = { httpOnly: true, secure: env.isProd, sameSite: p === 'apple' ? ('none' as const) : ('lax' as const), path: '/api/auth/oauth', maxAge: 600 };
  res.cookies.set('vt_oauth_state', state, opts);
  res.cookies.set('vt_oauth_verifier', verifier, opts);
  return res;
});
