import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { habits, profiles } from '@/db/schema';
import { addDays, dayBounds, lastNDays, today } from './dates';
import { notFound } from './http';

export const MET: Record<string, number> = { WALK: 3.5, RUN: 9.8, CYCLE: 7.5, STRENGTH: 5, YOGA: 2.5, HIIT: 8, CARDIO: 7, SWIM: 7, OTHER: 4 };
export const INTENSITY: Record<string, number> = { LIGHT: 0.8, MODERATE: 1, HARD: 1.2 };
export const estimateWorkoutKcal = (type: string, intensity: string, weightKg: number, minutes: number) =>
  Math.round((MET[type] ?? 4) * (INTENSITY[intensity] ?? 1) * weightKg * (minutes / 60));
export const KCAL_PER_STEP = 0.04;

export const METRIC_UNITS: Record<string, string> = {
  WEIGHT: 'kg', HEART_RATE: 'bpm', RESTING_HEART_RATE: 'bpm', BLOOD_PRESSURE: 'mmHg', SPO2: '%',
  BODY_TEMPERATURE: '°C', BLOOD_GLUCOSE: 'mg/dL', WAIST: 'cm', BODY_FAT: '%',
};
export const METRIC_RANGE: Record<string, [number, number]> = {
  WEIGHT: [20, 400], HEART_RATE: [25, 250], RESTING_HEART_RATE: [25, 200], BLOOD_PRESSURE: [50, 300], SPO2: [50, 100],
  BODY_TEMPERATURE: [30, 45], BLOOD_GLUCOSE: [20, 800], WAIST: [30, 250], BODY_FAT: [2, 75],
};

export async function getProfile(userId: string) {
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!p) throw notFound('Profile not found');
  return p;
}

/** Mifflin-St Jeor BMR × activity factor, adjusted by goals. Labelled as an estimate everywhere it is shown. */
export function suggestTargets(p: { birthYear: number | null; sex: string; heightCm: number | null; weightKg: number | null; activityLevel: string; goals: string[] }) {
  const age = p.birthYear ? new Date().getFullYear() - p.birthYear : 30;
  const w = p.weightKg ?? 65, h = p.heightCm ?? 165;
  const bmr = 10 * w + 6.25 * h - 5 * age + (p.sex === 'MALE' ? 5 : p.sex === 'FEMALE' ? -161 : -78);
  const af = { SEDENTARY: 1.2, LIGHT: 1.375, MODERATE: 1.55, ACTIVE: 1.725 }[p.activityLevel] ?? 1.45;
  let kcal = bmr * af;
  if (p.goals.includes('Lose weight')) kcal -= 400;
  if (p.goals.includes('Build muscle')) kcal += 250;
  return {
    calorieGoal: Math.round(kcal / 50) * 50,
    waterGoalMl: Math.round((w * 35) / 50) * 50,
    stepGoal: p.activityLevel === 'SEDENTARY' ? 6000 : p.activityLevel === 'ACTIVE' ? 10000 : 8000,
    sleepGoalH: 8,
    proteinG: Math.round(w * 1.2),
    method: 'Mifflin-St Jeor estimate; water 35 ml/kg',
  };
}

export type DayStats = {
  date: string; waterMl: number; steps: number; kcalIn: number; protein: number; carbs: number; fat: number;
  activeMin: number; workoutKcal: number; burnedKcalEst: number; sleepH: number | null; sleepQuality: number | null;
  mood: number | null; stress: number | null; habitsDone: number; habitsTotal: number; meditationMin: number;
};

type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: Row[] }).rows;

/** Aggregates every tracked signal per local day in one round of grouped queries. */
export async function dayStats(userId: string, tz: string, days: string[]): Promise<Record<string, DayStats>> {
  const from = dayBounds(days[0], tz).start, to = dayBounds(days[days.length - 1], tz).end;
  const ld = (col: string) => sql.raw(`to_char((${col} AT TIME ZONE '${tz.replace(/'/g, '')}')::date, 'YYYY-MM-DD')`);
  const [water, steps, food, work, sleep, mood, comp, med] = await Promise.all([
    rows(sql`select ${ld('logged_at')} d, sum(amount_ml)::int v from water_logs where user_id=${userId} and logged_at>=${from} and logged_at<${to} group by 1`),
    rows(sql`select to_char(date,'YYYY-MM-DD') d, max(steps)::int v from activity_logs where user_id=${userId} and date>=${days[0]} and date<=${days[days.length - 1]} group by 1`),
    rows(sql`select ${ld('eaten_at')} d, sum(calories) k, sum(protein) p, sum(carbs) c, sum(fat) f from nutrition_logs where user_id=${userId} and eaten_at>=${from} and eaten_at<${to} group by 1`),
    rows(sql`select ${ld('started_at')} d, sum(duration_min)::int m, sum(calories)::int k from workouts where user_id=${userId} and started_at>=${from} and started_at<${to} group by 1`),
    rows(sql`select distinct on (wake_date) to_char(wake_date,'YYYY-MM-DD') d, extract(epoch from (wake_time-bedtime))/3600 h, quality q from sleep_logs where user_id=${userId} and wake_date>=${days[0]} and wake_date<=${days[days.length - 1]} order by wake_date, (source='DEVICE') desc`),
    rows(sql`select distinct on (1) ${ld('logged_at')} d, mood, stress from mood_logs where user_id=${userId} and logged_at>=${from} and logged_at<${to} order by 1, logged_at desc`),
    rows(sql`select to_char(date,'YYYY-MM-DD') d, count(*)::int n from habit_completions where user_id=${userId} and date>=${days[0]} and date<=${days[days.length - 1]} group by 1`),
    rows(sql`select ${ld('completed_at')} d, sum(minutes)::int m from meditation_sessions where user_id=${userId} and completed_at>=${from} and completed_at<${to} group by 1`),
  ]);
  const hs = await db.select({ createdAt: habits.createdAt, archivedAt: habits.archivedAt }).from(habits).where(eq(habits.userId, userId));
  const by = (rs: Row[]) => new Map(rs.map((r) => [String(r.d), r]));
  const W = by(water), S = by(steps), F = by(food), K = by(work), SL = by(sleep), M = by(mood), C = by(comp), MD = by(med);
  const out: Record<string, DayStats> = {};
  for (const d of days) {
    const end = dayBounds(d, tz).end;
    const total = hs.filter((h) => h.createdAt < end && (!h.archivedAt || h.archivedAt >= dayBounds(d, tz).start)).length;
    const st = Number(S.get(d)?.v ?? 0), wk = Number(K.get(d)?.k ?? 0);
    out[d] = {
      date: d, waterMl: Number(W.get(d)?.v ?? 0), steps: st,
      kcalIn: Math.round(Number(F.get(d)?.k ?? 0)), protein: Math.round(Number(F.get(d)?.p ?? 0)), carbs: Math.round(Number(F.get(d)?.c ?? 0)), fat: Math.round(Number(F.get(d)?.f ?? 0)),
      activeMin: Number(K.get(d)?.m ?? 0), workoutKcal: wk, burnedKcalEst: Math.round(wk + st * KCAL_PER_STEP),
      sleepH: SL.get(d) ? Math.round(Number(SL.get(d)!.h) * 10) / 10 : null, sleepQuality: SL.get(d) ? Number(SL.get(d)!.q) : null,
      mood: M.get(d) ? Number(M.get(d)!.mood) : null, stress: M.get(d) ? Number(M.get(d)!.stress) : null,
      habitsDone: Number(C.get(d)?.n ?? 0), habitsTotal: total, meditationMin: Number(MD.get(d)?.m ?? 0),
    };
  }
  return out;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** Same formula as the Vitalora app: average of the signals logged that day (needs ≥2), 0–10. */
export function wellnessScore(s: DayStats, g: { stepGoal: number; waterGoalMl: number; sleepGoalH: number }) {
  const parts = [
    { key: 'sleep', value: s.sleepH != null ? clamp(s.sleepH / g.sleepGoalH) * 0.7 + (s.sleepQuality ?? 3) / 5 * 0.3 : null },
    { key: 'steps', value: s.steps ? clamp(s.steps / g.stepGoal) : null },
    { key: 'water', value: s.waterMl ? clamp(s.waterMl / g.waterGoalMl) : null },
    { key: 'movement', value: s.activeMin ? clamp(s.activeMin / 30) : null },
    { key: 'mood', value: s.mood != null ? ((s.mood - 1) / 4) * 0.6 + ((5 - (s.stress ?? 3)) / 4) * 0.4 : null },
    { key: 'habits', value: s.habitsTotal ? clamp(s.habitsDone / s.habitsTotal) : null },
  ].map((p) => ({ ...p, value: p.value == null ? null : Math.round(p.value * 100) / 100 }));
  const got = parts.filter((p) => p.value != null) as { key: string; value: number }[];
  const score = got.length >= 2 ? Math.round((got.reduce((a, p) => a + p.value, 0) / got.length) * 100) / 10 : null;
  return { score, signals: got.length, parts, label: score == null ? 'not_enough_data' : score >= 8 ? 'excellent' : score >= 6.5 ? 'good' : score >= 5 ? 'fair' : 'needs_care' };
}

export async function streak(userId: string, tz: string, test: (s: DayStats) => boolean, maxDays = 60) {
  const days = lastNDays(maxDays, tz);
  const st = await dayStats(userId, tz, days);
  let n = 0, i = days.length - 1;
  if (!test(st[days[i]])) i--;
  for (; i >= 0 && test(st[days[i]]); i--) n++;
  return n;
}

export function insightsFrom(stats: DayStats[], g: { waterGoalMl: number; sleepGoalH: number; stepGoal: number }) {
  const out: { kind: string; text: string }[] = [];
  const last7 = stats.slice(-7), prev7 = stats.slice(-14, -7);
  const sl = last7.filter((s) => s.sleepH != null).map((s) => s.sleepH!);
  if (sl.length >= 3) {
    const a = sl.reduce((x, y) => x + y, 0) / sl.length;
    out.push({ kind: 'sleep', text: a < g.sleepGoalH - 0.5 ? `You averaged ${a.toFixed(1)} h of sleep this week, ${(g.sleepGoalH - a).toFixed(1)} h under your goal.` : `Sleep is on track at ${a.toFixed(1)} h a night this week.` });
  }
  const wd = last7.filter((s) => s.waterMl >= g.waterGoalMl).length;
  if (last7.some((s) => s.waterMl)) out.push({ kind: 'water', text: `You met your water goal on ${wd} of the last 7 days.` });
  const s1 = last7.reduce((a, s) => a + s.steps, 0), s0 = prev7.reduce((a, s) => a + s.steps, 0);
  if (s1 && s0) out.push({ kind: 'steps', text: `Steps are ${s1 >= s0 ? 'up' : 'down'} ${Math.abs(Math.round(((s1 - s0) / s0) * 100))}% on the previous week.` });
  const pairs = stats.filter((s) => s.sleepH != null && s.mood != null);
  const good = pairs.filter((s) => s.sleepH! >= 7).map((s) => s.mood!), bad = pairs.filter((s) => s.sleepH! < 7).map((s) => s.mood!);
  if (pairs.length >= 5 && good.length && bad.length) {
    const av = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
    out.push({ kind: 'mood', text: `Your mood averages ${av(good)}/5 after 7+ hours of sleep and ${av(bad)}/5 after shorter nights.` });
  }
  return out;
}

export { addDays, today, lastNDays };
