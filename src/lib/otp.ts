import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { otpCodes } from '@/db/schema';
import { ApiError } from './http';
import { otpHash, safeEqual } from './crypto';

export async function consumeOtp(targetIn: string, code: string, purpose: string) {
  const target = targetIn.startsWith('+') ? targetIn : targetIn.toLowerCase();
  const [row] = await db.select().from(otpCodes)
    .where(and(eq(otpCodes.target, target), eq(otpCodes.purpose, purpose as never), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date())))
    .orderBy(desc(otpCodes.createdAt)).limit(1);
  if (!row) throw new ApiError(400, 'otp_invalid', 'Code is invalid or has expired');
  if (row.attempts >= 5) throw new ApiError(429, 'otp_locked', 'Too many wrong attempts. Request a new code.');
  if (!safeEqual(row.codeHash, otpHash(target, code))) {
    await db.update(otpCodes).set({ attempts: row.attempts + 1 }).where(eq(otpCodes.id, row.id));
    throw new ApiError(400, 'otp_invalid', 'Code is invalid or has expired');
  }
  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, row.id));
  return target;
}

