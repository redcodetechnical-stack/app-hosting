/** Day maths in the user's own time zone (logs are stored in UTC). */
export function localDate(d: Date, tz: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

function offsetMinutes(at: Date, tz: string): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(at);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** UTC instant of local midnight for YYYY-MM-DD in tz. */
export function localMidnight(day: string, tz: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  const off = offsetMinutes(guess, tz);
  const t = new Date(guess.getTime() - off * 60000);
  const off2 = offsetMinutes(t, tz); // DST edge
  return off2 === off ? t : new Date(guess.getTime() - off2 * 60000);
}

export function dayBounds(day: string, tz: string) {
  return { start: localMidnight(day, tz), end: localMidnight(addDays(day, 1), tz) };
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export const today = (tz: string) => localDate(new Date(), tz);
export function lastNDays(n: number, tz: string, end?: string): string[] {
  const e = end ?? today(tz);
  return Array.from({ length: n }, (_, i) => addDays(e, i - n + 1));
}
export const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/** Combine a local date and "HH:mm" into a UTC instant. */
export function localDateTime(day: string, hhmm: string, tz: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(localMidnight(day, tz).getTime() + (h * 60 + m) * 60000);
}
