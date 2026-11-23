import { NextRequest } from 'next/server';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { db } from '@/db';
import { appointments, habitCompletions, habits, profiles, users } from '@/db/schema';
import { json } from '@/lib/http';
import { env } from '@/lib/env';
import { safeEqual } from '@/lib/crypto';
import { notify } from '@/lib/messaging';
import { dayStats, today } from '@/lib/wellness';

/** Run every 15 minutes from a scheduler (Vercel Cron, GitHub Actions, k8s CronJob) with header Authorization: Bearer CRON_SECRET.
 *  Creates water, bedtime, workout, meditation, habit and appointment reminders in each user's own time zone; dedupe keys stop repeats. */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  if (!env.cronSecret || !safeEqual(auth, `Bearer ${env.cronSecret}`)) return json({ error: { code: 'unauthorized' } }, 401);
  const now = new Date();
  const counts = { water: 0, bedtime: 0, workout: 0, meditation: 0, habit: 0, appointment: 0 };
  const ps = await db.select({ p: profiles, email: users.email, phone: users.phone }).from(profiles).innerJoin(users, eq(users.id, profiles.userId)).where(eq(users.status, 'ACTIVE'));
  for (const { p, email, phone } of ps) {
    const tz = p.timezone;
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
    const [h, m] = hm.split(':').map(Number);
    const d = today(tz);
    const ch = [...(p.notifyPrefs.push ? ['PUSH' as const] : []), ...(p.notifyPrefs.email ? ['EMAIL' as const] : []), ...(p.notifyPrefs.sms ? ['SMS' as const] : [])];
    const inWindow = (t: string | null) => { if (!t) return false; const [th, tm] = t.split(':').map(Number); const diff = h * 60 + m - (th * 60 + tm); return diff >= 0 && diff < 15; };
    const send = async (k: keyof typeof counts, type: never, title: string, body: string, key: string) => { const r = await notify({ userId: p.userId, type, title, body, dedupeKey: key, channels: ch, email, phone }); if (r.created) counts[k]++; };
    if (p.notifyPrefs.water?.on && h >= 8 && h < 22) {
      const slot = Math.floor((h * 60 + m - 480) / (p.notifyPrefs.water.everyH * 60));
      if ((h * 60 + m - 480) % (p.notifyPrefs.water.everyH * 60) < 15) {
        const st = (await dayStats(p.userId, tz, [d]))[d];
        if (st.waterMl < p.waterGoalMl) await send('water', 'WATER' as never, 'Time for water', `You're at ${st.waterMl} of ${p.waterGoalMl} ml today.`, `water:${p.userId}:${d}:${slot}`);
      }
    }
    if (inWindow(p.notifyPrefs.bedtime)) await send('bedtime', 'SLEEP' as never, 'Wind-down time', 'Bedtime is coming up. Dim the lights and put the phone away.', `bed:${p.userId}:${d}`);
    if (inWindow(p.notifyPrefs.workout)) await send('workout', 'WORKOUT' as never, 'Workout reminder', 'A short session now keeps your streak going.', `wo:${p.userId}:${d}`);
    if (inWindow(p.notifyPrefs.meditation)) await send('meditation', 'MEDITATION' as never, 'Take a mindful pause', 'Two minutes of slow breathing can reset your day.', `med:${p.userId}:${d}`);
    const hs = await db.select().from(habits).where(and(eq(habits.userId, p.userId), isNull(habits.archivedAt)));
    for (const hb of hs.filter((x) => inWindow(x.reminderAt))) {
      const [done] = await db.select().from(habitCompletions).where(and(eq(habitCompletions.habitId, hb.id), eq(habitCompletions.date, d)));
      if (!done) await send('habit', 'HABIT' as never, 'Habit reminder', `Time for: ${hb.name}`, `habit:${hb.id}:${d}`);
    }
  }
  const soon = await db.select().from(appointments).where(and(gt(appointments.startsAt, now), lt(appointments.startsAt, new Date(now.getTime() + 3600_000)), isNull(appointments.reminderSentAt)));
  for (const a of soon) {
    if (!['REQUESTED', 'CONFIRMED'].includes(a.status)) continue;
    await notify({ userId: a.userId, type: 'APPOINTMENT', title: 'Appointment within the hour', body: `Your appointment starts at ${a.startsAt.toISOString().slice(11, 16)} UTC.${a.videoRoomUrl ? ' Join from the Appointments page.' : ''}`, dedupeKey: `apptrem:${a.id}`, channels: ['PUSH'] });
    await db.update(appointments).set({ reminderSentAt: now }).where(eq(appointments.id, a.id));
    counts.appointment++;
  }
  return json({ ok: true, ranAt: now.toISOString(), created: counts });
}

/** Vercel Cron calls GET with Authorization: Bearer $CRON_SECRET. */
export const GET = POST;
