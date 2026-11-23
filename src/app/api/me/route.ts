import { z } from 'zod';
import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { route, ApiError } from '@/lib/http';
import { clearAuthCookies, verifyPassword } from '@/lib/auth';
import { consumeOtp } from '@/lib/otp';
import { audit } from '@/lib/audit';

/** Account deletion (right to erasure). Requires the password, or an OTP (purpose DELETE_ACCOUNT) for password-less accounts.
 *  All personal data cascades away; the user row is kept as an anonymised tombstone so audit and payment records stay valid. */
export const DELETE = route({ body: z.object({ password: z.string().optional(), otp: z.string().regex(/^\d{6}$/).optional(), confirm: z.literal('DELETE') }), rate: [5, 3600] }, async ({ user, body, ip }) => {
  const [u] = await db.select().from(users).where(eq(users.id, user.id));
  if (u.passwordHash) { if (!(await verifyPassword(body.password ?? '', u.passwordHash))) throw new ApiError(400, 'invalid_password', 'Password is incorrect'); }
  else if (body.otp) await consumeOtp(u.email ?? u.phone ?? '', body.otp, 'DELETE_ACCOUNT');
  else throw new ApiError(400, 'otp_required', 'Request a DELETE_ACCOUNT code and send it as otp');
  await audit(user.id, 'privacy.account_deleted', { type: 'user', id: user.id }, undefined, ip);
  await db.transaction(async (tx) => {
    // Remove every user-owned row via cascading FK by re-keying the user, then anonymise the tombstone.
    const tables = ['profiles','sessions','consents','health_metrics','activity_logs','workouts','workout_plans','nutrition_logs','grocery_items','water_logs','sleep_logs','mood_logs','journal_entries','assessments','habit_completions','habits','meditation_sessions','ai_conversations','ai_reports','notifications','devices','integrations','appointments','reviews','challenge_participants','user_achievements','post_likes','comments','community_posts','group_members','reports','blocks','family_members'];
    for (const t of tables) {
      const col = t === 'community_posts' || t === 'comments' ? 'author_id' : t === 'reports' ? 'reporter_id' : t === 'blocks' ? 'blocker_id' : t === 'family_members' ? 'owner_id' : 'user_id';
      await tx.execute(sql`delete from ${sql.identifier(t)} where ${sql.identifier(col)} = ${user.id}`);
    }
    await tx.execute(sql`delete from food_items where owner_id = ${user.id}`);
    await tx.update(users).set({ email: null, phone: null, passwordHash: null, googleId: null, appleId: null, status: 'DELETED', deletedAt: new Date() }).where(eq(users.id, user.id));
  });
  const res = NextResponse.json({ ok: true, message: 'Your account and personal data have been deleted.' });
  clearAuthCookies(res);
  return res;
});
