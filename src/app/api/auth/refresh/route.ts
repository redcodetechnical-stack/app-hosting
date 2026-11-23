import { z } from 'zod';
import { route, unauthorized } from '@/lib/http';
import { REFRESH_COOKIE, rotateRefresh } from '@/lib/auth';

export const POST = route({ auth: false, body: z.object({ refreshToken: z.string().optional() }), rate: [30, 60] }, async ({ body, req }) => {
  const token = body.refreshToken ?? req.cookies.get(REFRESH_COOKIE)?.value;
  if (!token) throw unauthorized('No refresh token');
  const res = await rotateRefresh(token, req);
  if (!res) throw unauthorized('Session expired. Please sign in again.');
  return res;
});
