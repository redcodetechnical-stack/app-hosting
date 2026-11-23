import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { professionals } from '@/db/schema';
import { ApiError } from './http';

export async function myProfessional(userId: string, requireVerified = true) {
  const [p] = await db.select().from(professionals).where(eq(professionals.userId, userId));
  if (!p) throw new ApiError(403, 'not_professional', 'This account is not registered as a professional');
  if (requireVerified && p.status !== 'VERIFIED') throw new ApiError(403, 'not_verified', 'Your professional profile is not verified yet');
  return p;
}
