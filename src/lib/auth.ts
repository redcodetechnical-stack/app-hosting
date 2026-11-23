import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { adminRoles, permissions, rolePermissions, sessions, users, profiles } from '@/db/schema';
import { requireSecret, env } from './env';
import { randomToken, sha256 } from './crypto';

export type AuthUser = { id: string; email: string | null; phone: string | null; role: string; permissions: Set<string>; status: string };

const ACCESS_TTL = 15 * 60; // seconds
const REFRESH_TTL_DAYS = 30;
export const ACCESS_COOKIE = 'vt_access';
export const REFRESH_COOKIE = 'vt_refresh';

const secret = () => new TextEncoder().encode(requireSecret('jwtSecret'));

export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const verifyPassword = (p: string, h: string | null) => (h ? bcrypt.compare(p, h) : Promise.resolve(false));

// role -> permissions cache (60 s)
const permCache = new Map<string, { at: number; key: string; perms: Set<string> }>();
export async function rolePerms(roleId: string) {
  const c = permCache.get(roleId);
  if (c && Date.now() - c.at < 60_000) return c;
  const [role] = await db.select().from(adminRoles).where(eq(adminRoles.id, roleId));
  const rows = await db.select({ key: permissions.key }).from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id)).where(eq(rolePermissions.roleId, roleId));
  const v = { at: Date.now(), key: role?.key ?? 'USER', perms: new Set(rows.map((r) => r.key)) };
  permCache.set(roleId, v);
  return v;
}
export const clearPermCache = () => permCache.clear();

export async function signAccess(userId: string, role: string) {
  return new SignJWT({ role }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId)
    .setIssuedAt().setIssuer('vitalora').setExpirationTime(`${ACCESS_TTL}s`).sign(secret());
}

export async function authenticate(req: NextRequest): Promise<{ user: AuthUser; viaCookie: boolean } | null> {
  const h = req.headers.get('authorization');
  let token = h?.startsWith('Bearer ') ? h.slice(7) : undefined;
  let viaCookie = false;
  if (!token) { token = req.cookies.get(ACCESS_COOKIE)?.value; viaCookie = !!token; }
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: 'vitalora' });
    const [u] = await db.select().from(users).where(eq(users.id, String(payload.sub)));
    if (!u || u.status !== 'ACTIVE') return null;
    const rp = await rolePerms(u.roleId);
    return { viaCookie, user: { id: u.id, email: u.email, phone: u.phone, role: rp.key, permissions: rp.perms, status: u.status } };
  } catch {
    return null;
  }
}

/** Creates a session (refresh token) + access token and returns the JSON response with cookies set. */
export async function issueSession(userId: string, req: NextRequest, extra: Record<string, unknown> = {}, status = 200) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  const rp = await rolePerms(u.roleId);
  const refresh = randomToken(48);
  await db.insert(sessions).values({
    userId, refreshHash: sha256(refresh), userAgent: req.headers.get('user-agent')?.slice(0, 300),
    ip: req.headers.get('x-forwarded-for')?.split(',')[0] ?? null,
    expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 864e5),
  });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  const access = await signAccess(userId, rp.key);
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  const res = NextResponse.json({
    accessToken: access, refreshToken: refresh, expiresIn: ACCESS_TTL,
    user: publicUser(u, rp.key, [...rp.perms], p), ...extra,
  }, { status });
  setAuthCookies(res, access, refresh);
  return res;
}

export function setAuthCookies(res: NextResponse, access: string, refresh: string) {
  const secure = env.isProd;
  res.cookies.set(ACCESS_COOKIE, access, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: ACCESS_TTL });
  res.cookies.set(REFRESH_COOKIE, refresh, { httpOnly: true, secure, sameSite: 'lax', path: '/api/auth', maxAge: REFRESH_TTL_DAYS * 86400 });
}
export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, '', { path: '/api/auth', maxAge: 0 });
}

export async function rotateRefresh(refresh: string, req: NextRequest) {
  const [s] = await db.select().from(sessions)
    .where(and(eq(sessions.refreshHash, sha256(refresh)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  if (!s) return null;
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, s.id));
  const [u] = await db.select().from(users).where(eq(users.id, s.userId));
  if (!u || u.status !== 'ACTIVE') return null;
  return issueSession(u.id, req);
}

export function publicUser(u: typeof users.$inferSelect, role: string, perms: string[], p?: typeof profiles.$inferSelect) {
  return {
    id: u.id, email: u.email, phone: u.phone, role, permissions: perms, status: u.status,
    emailVerified: !!u.emailVerifiedAt, phoneVerified: !!u.phoneVerifiedAt, createdAt: u.createdAt,
    profile: p ?? null,
  };
}

export async function roleId(key: string) {
  const [r] = await db.select().from(adminRoles).where(eq(adminRoles.key, key));
  if (!r) throw new Error(`Role ${key} missing — run the seed`);
  return r.id;
}

export const passwordRule = { min: 8, max: 128, re: /^(?=.*[A-Za-z])(?=.*\d).+$/ };
