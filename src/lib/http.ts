import { NextRequest, NextResponse } from 'next/server';
import { ZodError, type ZodType, type ZodTypeDef } from 'zod';
import { authenticate, type AuthUser } from './auth';
import { rateLimit } from './ratelimit';
import { env } from './env';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
export const badRequest = (m: string, d?: unknown) => new ApiError(400, 'bad_request', m, d);
export const unauthorized = (m = 'Sign in required') => new ApiError(401, 'unauthorized', m);
export const forbidden = (m = 'You do not have permission for this action') => new ApiError(403, 'forbidden', m);
export const notFound = (m = 'Not found') => new ApiError(404, 'not_found', m);
export const conflict = (m: string) => new ApiError(409, 'conflict', m);
export const notConfigured = (what: string) =>
  new ApiError(503, 'not_configured', `${what} is not configured on this server. Add its keys to the environment to enable it.`);

export type Ctx<B = any> = {
  req: NextRequest;
  user: AuthUser;
  params: Record<string, string>;
  query: URLSearchParams;
  body: B;
  ip: string;
};
type PublicCtx<B = any> = Omit<Ctx<B>, 'user'> & { user: AuthUser | null };

type Opts<B> = {
  auth?: boolean;             // default true
  perm?: string | string[];   // any-of permission keys
  body?: ZodType<B, ZodTypeDef, any>;
  rate?: [number, number];    // [max requests, window seconds] per user/ip
  rawBody?: boolean;          // keep body unparsed (webhooks)
};

export function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '0.0.0.0').trim();
}

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(data, { status, headers });
}

function csrfOk(req: NextRequest): boolean {
  // Cookie-authenticated, state-changing requests must come from an allowed origin.
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('x-requested-with') === 'vitalora';
  const allowed = [env.appUrl, ...env.corsOrigins];
  return allowed.some((a) => a.replace(/\/$/, '') === origin.replace(/\/$/, ''));
}

/** Route wrapper: auth, RBAC, rate limits, zod validation, uniform errors. */
export function route<B = any>(opts: Opts<B> & { auth: false }, fn: (c: PublicCtx<B>) => Promise<unknown>): (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
export function route<B = any>(opts: Opts<B>, fn: (c: Ctx<B>) => Promise<unknown>): (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
export function route<B = any>(opts: Opts<B>, fn: (c: any) => Promise<unknown>) {
  return async (req: NextRequest, rctx: { params: Promise<Record<string, string>> }) => {
    try {
      const ip = clientIp(req);
      const needAuth = opts.auth !== false;
      const auth = await authenticate(req);
      if (needAuth && !auth) throw unauthorized();
      if (auth?.viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !csrfOk(req))
        throw new ApiError(403, 'csrf', 'Cross-site request blocked');
      const user = auth?.user ?? null;
      if (opts.perm) {
        const want = Array.isArray(opts.perm) ? opts.perm : [opts.perm];
        if (!user || !want.some((p) => user.permissions.has(p))) throw forbidden();
      }
      if (opts.rate) {
        const [max, win] = opts.rate;
        const k = `${req.method}:${req.nextUrl.pathname.replace(/\/[0-9a-f-]{36}/g, '/:id')}:${user?.id ?? ip}`;
        const r = await rateLimit(k, max, win);
        if (!r.ok) return json({ error: { code: 'rate_limited', message: 'Too many requests. Try again shortly.' } }, 429, { 'Retry-After': String(r.retryAfter) });
      }
      let body: unknown = undefined;
      const hasBody = !['GET', 'HEAD'].includes(req.method) && (req.method !== 'DELETE' || Number(req.headers.get('content-length') ?? 0) > 0);
      if (!opts.rawBody && hasBody && opts.body) {
        const ct = req.headers.get('content-type') ?? '';
        let raw: unknown = {};
        if (ct.includes('application/json')) {
          const t = await req.text();
          if (t.length > 1_000_000) throw new ApiError(413, 'too_large', 'Request body too large');
          try { raw = t ? JSON.parse(t) : {}; } catch { throw badRequest('Invalid JSON'); }
        } else if (ct.includes('form')) {
          raw = Object.fromEntries((await req.formData()).entries());
        }
        body = opts.body.parse(raw);
      } else if (!opts.rawBody && opts.body) {
        body = opts.body.parse({});
      }
      const params = (await rctx?.params) ?? {};
      const out = await fn({ req, user, params, query: req.nextUrl.searchParams, body, ip });
      if (out instanceof Response) return out;
      return json(out ?? { ok: true });
    } catch (err) {
      if (err instanceof ApiError) return json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
      if (err instanceof ZodError)
        return json({ error: { code: 'validation_error', message: 'Some fields are invalid', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } }, 422);
      const pg = ((err as { cause?: { code?: string } })?.cause ?? err) as { code?: string };
      if (pg?.code === '23505') return json({ error: { code: 'conflict', message: 'This already exists' } }, 409);
      if (pg?.code === '23503') return json({ error: { code: 'bad_reference', message: 'A referenced record does not exist' } }, 400);
      if (pg?.code === '22P02') return json({ error: { code: 'bad_request', message: 'Invalid identifier or value' } }, 400);
      console.error('[api]', req.method, req.nextUrl.pathname, err);
      return json({ error: { code: 'internal', message: 'Something went wrong' } }, 500);
    }
  };
}

export function paging(q: URLSearchParams, maxLimit = 100) {
  const limit = Math.min(maxLimit, Math.max(1, Number(q.get('limit') ?? 20) || 20));
  const page = Math.max(1, Number(q.get('page') ?? 1) || 1);
  return { limit, offset: (page - 1) * limit, page };
}
