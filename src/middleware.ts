import { NextRequest, NextResponse } from 'next/server';

const allowed = () => [process.env.APP_URL ?? 'http://localhost:3000', ...(process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)];

/** CORS for the web/mobile clients + security headers on every API response. */
export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin');
  const ok = !!origin && allowed().includes(origin);
  const headers = new Headers();
  if (ok) {
    headers.set('Access-Control-Allow-Origin', origin!);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    headers.set('Access-Control-Max-Age', '600');
    return new NextResponse(null, { status: ok ? 204 : 403, headers });
  }
  const res = NextResponse.next();
  headers.forEach((v, k) => res.headers.set(k, v));
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  if (req.nextUrl.pathname.startsWith('/api/')) res.headers.set('Cache-Control', 'no-store');
  return res;
}

export const config = { matcher: ['/api/:path*'] };
