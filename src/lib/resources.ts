import { z } from 'zod';
import { crud, zDay, zIso, zText, zTime } from './crud';
import * as s from '@/db/schema';
import { decrypt, encrypt } from './crypto';
import { estimateWorkoutKcal, getProfile, METRIC_RANGE, METRIC_UNITS } from './wellness';
import { localDateTime } from './dates';
import { ApiError } from './http';

export const water = crud({
  table: s.waterLogs, timeCol: s.waterLogs.loggedAt,
  create: z.object({ amountMl: z.number().int().min(10).max(3000), loggedAt: zIso.optional() }),
  update: z.object({ amountMl: z.number().int().min(10).max(3000) }),
  toInsert: (b) => ({ amountMl: b.amountMl, loggedAt: b.loggedAt ?? new Date() }),
});

const WorkoutBody = z.object({
  type: z.enum(['WALK', 'RUN', 'CYCLE', 'STRENGTH', 'YOGA', 'HIIT', 'CARDIO', 'SWIM', 'OTHER']),
  durationMin: z.number().int().min(1).max(600), distanceKm: z.number().min(0).max(500).optional(),
  intensity: z.enum(['LIGHT', 'MODERATE', 'HARD']).default('MODERATE'), startedAt: zIso.optional(), notes: z.string().max(500).optional(),
});
export const workouts = crud({
  table: s.workouts, timeCol: s.workouts.startedAt, create: WorkoutBody, update: WorkoutBody.partial(),
  toInsert: async (b, c) => {
    const p = await getProfile(c.user.id);
    return { ...b, startedAt: b.startedAt ?? new Date(), calories: estimateWorkoutKcal(b.type, b.intensity, p.weightKg ?? 65, b.durationMin), source: 'ESTIMATED' };
  },
  toUpdate: async (b, c, ex) => {
    const p = await getProfile(c.user.id);
    const m = { ...ex, ...b };
    return { ...b, calories: estimateWorkoutKcal(m.type, m.intensity, p.weightKg ?? 65, m.durationMin) };
  },
});

const SleepBody = z.object({ wakeDate: zDay, bedtime: zTime, wakeTime: zTime, quality: z.number().int().min(1).max(5), note: z.string().max(1000).optional() });
const sleepTimes = (wakeDate: string, bed: string, wake: string, tz: string) => {
  const w = localDateTime(wakeDate, wake, tz);
  let b = localDateTime(wakeDate, bed, tz);
  if (b >= w) b = new Date(b.getTime() - 864e5); // went to bed the previous evening
  if ((w.getTime() - b.getTime()) / 36e5 > 16) throw new ApiError(422, 'validation_error', 'Sleep longer than 16 hours: check bedtime and wake time');
  return { bedtime: b, wakeTime: w };
};
export const sleep = crud({
  table: s.sleepLogs, dateCol: s.sleepLogs.wakeDate, create: SleepBody, update: SleepBody.partial(),
  toInsert: async (b, c) => ({ wakeDate: b.wakeDate, quality: b.quality, noteEnc: encrypt(b.note), source: 'MANUAL', ...sleepTimes(b.wakeDate, b.bedtime, b.wakeTime, (await getProfile(c.user.id)).timezone) }),
  toUpdate: async (b, c, ex) => {
    const tz = (await getProfile(c.user.id)).timezone;
    const out: Record<string, unknown> = {};
    if (b.quality) out.quality = b.quality;
    if (b.note !== undefined) out.noteEnc = encrypt(b.note);
    if (b.bedtime || b.wakeTime || b.wakeDate) {
      const hm = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
      Object.assign(out, { wakeDate: b.wakeDate ?? ex.wakeDate }, sleepTimes(b.wakeDate ?? ex.wakeDate, b.bedtime ?? hm(ex.bedtime), b.wakeTime ?? hm(ex.wakeTime), tz));
    }
    return out;
  },
  toDto: (r) => ({ ...r, noteEnc: undefined, note: decrypt(r.noteEnc), hours: Math.round(((r.wakeTime - r.bedtime) / 36e5) * 10) / 10 }),
});

const MoodBody = z.object({ mood: z.number().int().min(1).max(5), stress: z.number().int().min(1).max(5), tags: z.array(z.string().max(30)).max(10).default([]), note: z.string().max(1000).optional(), loggedAt: zIso.optional() });
export const moods = crud({
  table: s.moodLogs, timeCol: s.moodLogs.loggedAt, create: MoodBody, update: MoodBody.partial(),
  toInsert: (b) => ({ mood: b.mood, stress: b.stress, tags: b.tags, noteEnc: encrypt(b.note), loggedAt: b.loggedAt ?? new Date() }),
  toUpdate: (b) => { const { note, ...r } = b; return { ...r, ...(note !== undefined ? { noteEnc: encrypt(note) } : {}) }; },
  toDto: (r) => ({ ...r, noteEnc: undefined, note: decrypt(r.noteEnc) }),
});

const JournalBody = z.object({ kind: z.enum(['EMOTIONAL', 'GRATITUDE', 'SLEEP']), body: zText(10000) });
export const journal = crud({
  table: s.journalEntries, timeCol: s.journalEntries.createdAt, create: JournalBody, update: JournalBody.partial(),
  toInsert: (b) => ({ kind: b.kind, bodyEnc: encrypt(b.body)! }),
  toUpdate: (b) => ({ ...(b.kind ? { kind: b.kind } : {}), ...(b.body ? { bodyEnc: encrypt(b.body)! } : {}) }),
  toDto: (r) => ({ id: r.id, kind: r.kind, body: decrypt(r.bodyEnc), createdAt: r.createdAt }),
});

const MetricBody = z.object({
  kind: z.enum(['WEIGHT', 'HEART_RATE', 'RESTING_HEART_RATE', 'BLOOD_PRESSURE', 'SPO2', 'BODY_TEMPERATURE', 'BLOOD_GLUCOSE', 'WAIST', 'BODY_FAT']),
  value: z.number(), value2: z.number().optional(), measuredAt: zIso.optional(), note: z.string().max(500).optional(),
}).superRefine((b, ctx) => {
  const [lo, hi] = METRIC_RANGE[b.kind];
  if (b.value < lo || b.value > hi) ctx.addIssue({ code: 'custom', path: ['value'], message: `Must be between ${lo} and ${hi} ${METRIC_UNITS[b.kind]}` });
  if (b.kind === 'BLOOD_PRESSURE' && (b.value2 == null || b.value2 < 30 || b.value2 >= b.value)) ctx.addIssue({ code: 'custom', path: ['value2'], message: 'Diastolic is required and must be lower than systolic' });
  if (b.measuredAt && b.measuredAt.getTime() > Date.now() + 60_000) ctx.addIssue({ code: 'custom', path: ['measuredAt'], message: 'Cannot be in the future' });
});
export const metrics = crud({
  table: s.healthMetrics, timeCol: s.healthMetrics.measuredAt, create: MetricBody,
  update: z.object({ note: z.string().max(500).optional() }),
  toInsert: async (b, c) => {
    if (b.kind === 'WEIGHT') { const { db } = await import('@/db'); const { eq } = await import('drizzle-orm'); await db.update(s.profiles).set({ weightKg: b.value }).where(eq(s.profiles.userId, c.user.id)); }
    return { kind: b.kind, value: b.value, value2: b.kind === 'BLOOD_PRESSURE' ? b.value2 : null, unit: METRIC_UNITS[b.kind], measuredAt: b.measuredAt ?? new Date(), noteEnc: encrypt(b.note), source: 'MANUAL' };
  },
  toUpdate: (b) => ({ noteEnc: encrypt(b.note) }),
  toDto: (r) => ({ ...r, noteEnc: undefined, note: decrypt(r.noteEnc) }),
});

export const grocery = crud({
  table: s.groceryItems, timeCol: s.groceryItems.createdAt,
  create: z.object({ text: zText(80) }), update: z.object({ text: zText(80).optional(), done: z.boolean().optional() }),
  toInsert: (b) => ({ text: b.text }),
});

export const meditation = crud({
  table: s.meditationSessions, timeCol: s.meditationSessions.completedAt,
  create: z.object({ minutes: z.number().int().min(1).max(240), kind: z.enum(['guided', 'breathing', 'timer', 'logged']).default('logged'), contentId: z.string().optional(), completedAt: zIso.optional() }),
  toInsert: (b) => ({ minutes: b.minutes, kind: b.kind, contentId: b.contentId ?? null, completedAt: b.completedAt ?? new Date() }),
});
