import { z } from 'zod';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { sessions } from '@/db/schema';
import { route } from '@/lib/http';
import { REFRESH_COOKIE, clearAuthCookies } from '@/lib/auth';
import { sha256 } from '@/lib/crypto';

export const POST = route({ auth: false, body: z.object({ refreshToken: z.string().optional() }) }, async ({ body, req }) => {
  const token = body.refreshToken ?? req.cookies.get(REFRESH_COOKIE)?.value;
  if (token) await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.refreshHash, sha256(token)));
  const res = NextResponse.json({ ok: true });
  clearAuthCookies(res);
  return res;
});
