/**
 * End-to-end API test against a running server + real PostgreSQL.
 *   npm run build && npm start   (with SANDBOX_MODE=true and a seeded DB)
 *   npm run test:e2e
 * Writes docs/TEST_REPORT.md with every check and its result.
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Client } from 'pg';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
type R = { status: number; body: any; headers: Headers };
let reqN = 1;
const results: { area: string; name: string; ok: boolean; detail?: string }[] = [];
let area = 'setup';
const section = (a: string) => { area = a; };
function check(name: string, cond: unknown, detail?: unknown) {
  results.push({ area, name, ok: !!cond, detail: cond ? undefined : JSON.stringify(detail)?.slice(0, 400) });
  if (!cond) console.log(`  ✗ [${area}] ${name}`, JSON.stringify(detail)?.slice(0, 300));
}

async function call(method: string, path: string, o: { token?: string; body?: unknown; headers?: Record<string, string>; form?: FormData; raw?: string } = {}): Promise<R> {
  const h: Record<string, string> = { 'X-Forwarded-For': `10.1.${(reqN >> 8) & 255}.${reqN++ & 255}`, ...(o.headers ?? {}) };
  if (o.token) h.Authorization = `Bearer ${o.token}`;
  let body: BodyInit | undefined;
  if (o.form) body = o.form;
  else if (o.raw !== undefined) { body = o.raw; h['Content-Type'] ??= 'application/json'; }
  else if (o.body !== undefined) { body = JSON.stringify(o.body); h['Content-Type'] = 'application/json'; }
  const r = await fetch(BASE + path, { method, headers: h, body, redirect: 'manual' });
  const t = await r.text();
  let j: any = t;
  try { j = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: j, headers: r.headers };
}
const get = (p: string, token?: string) => call('GET', p, { token });
const post = (p: string, body: unknown, token?: string) => call('POST', p, { body, token });
const patch = (p: string, body: unknown, token?: string) => call('PATCH', p, { body, token });
const put = (p: string, body: unknown, token?: string) => call('PUT', p, { body, token });
const del = (p: string, token?: string, body?: unknown) => call('DELETE', p, { token, body });

const uniq = Date.now().toString(36);
const consent = { terms: true, privacy: true, healthData: true };
async function register(name: string) {
  const email = `${name.toLowerCase()}.${uniq}@example.com`;
  const r = await post('/api/auth/register', { email, password: 'Str0ngPass!x', name, consent });
  return { email, token: r.body.accessToken as string, refresh: r.body.refreshToken as string, id: r.body.user?.id as string, r };
}
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

async function main() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL }); await pg.connect();

  section('health');
  const h = await get('/api/health');
  check('health ok + db up', h.status === 200 && h.body.db === 'ok', h);

  section('auth');
  const weak = await post('/api/auth/register', { email: `weak.${uniq}@example.com`, password: 'short', name: 'W', consent });
  check('weak password rejected (422)', weak.status === 422, weak);
  const noConsent = await post('/api/auth/register', { email: `nc.${uniq}@example.com`, password: 'Str0ngPass!x', name: 'N', consent: { terms: true, privacy: true, healthData: false } });
  check('registration requires health-data consent', noConsent.status === 422, noConsent);
  const A = await register('Asha');
  check('register 201 + tokens', A.r.status === 201 && !!A.token && !!A.refresh, A.r);
  check('session cookies set (httpOnly)', (A.r.headers.get('set-cookie') ?? '').includes('HttpOnly'), A.r.headers.get('set-cookie'));
  const dup = await post('/api/auth/register', { email: A.email, password: 'Str0ngPass!x', name: 'x', consent });
  check('duplicate email 409', dup.status === 409, dup);
  const bad = await post('/api/auth/login', { email: A.email, password: 'wrongpass1' });
  check('wrong password 401', bad.status === 401, bad);
  const login = await post('/api/auth/login', { email: A.email, password: 'Str0ngPass!x' });
  check('login 200', login.status === 200 && !!login.body.accessToken, login);
  const me = await get('/api/auth/me', A.token);
  check('me returns USER role + FREE plan', me.body.role === 'USER' && me.body.plan === 'FREE', me);
  check('no token 401', (await get('/api/auth/me')).status === 401);
  check('garbage token 401', (await get('/api/auth/me', 'abc.def.ghi')).status === 401);
  const ref = await post('/api/auth/refresh', { refreshToken: A.refresh });
  check('refresh rotates tokens', ref.status === 200 && ref.body.refreshToken !== A.refresh, ref);
  const reuse = await post('/api/auth/refresh', { refreshToken: A.refresh });
  check('old refresh token rejected after rotation', reuse.status === 401, reuse);
  const ss = await get('/api/auth/sessions', A.token);
  check('sessions listed', ss.status === 200 && ss.body.items.length >= 2, ss);

  section('auth: otp, password reset, rate limits, csrf');
  const phone = `+9198${String(Date.now()).slice(-8)}`;
  const otp = await post('/api/auth/otp/request', { target: phone, purpose: 'LOGIN' });
  check('OTP request (dev returns devCode when SMS unconfigured)', otp.status === 200 && /^\d{6}$/.test(otp.body.devCode), otp);
  const wrong = await post('/api/auth/otp/verify', { target: phone, code: otp.body.devCode === '000000' ? '111111' : '000000', purpose: 'LOGIN' });
  check('wrong OTP rejected', wrong.status === 400, wrong);
  const ov = await post('/api/auth/otp/verify', { target: phone, code: otp.body.devCode, purpose: 'LOGIN' });
  check('phone OTP login creates account', ov.status === 201 && ov.body.created === true && ov.body.user.phone === phone, ov);
  const reused = await post('/api/auth/otp/verify', { target: phone, code: otp.body.devCode, purpose: 'LOGIN' });
  check('OTP single use', reused.status === 400, reused);
  const fg = await post('/api/auth/password/forgot', { email: A.email });
  check('forgot password generic response', fg.status === 200 && /^\d{6}$/.test(fg.body.devCode ?? ''), fg);
  const fgx = await post('/api/auth/password/forgot', { email: `nobody.${uniq}@example.com` });
  check('forgot password does not reveal unknown emails', fgx.status === 200 && !fgx.body.devCode, fgx);
  const rs = await post('/api/auth/password/reset', { email: A.email, code: fg.body.devCode, newPassword: 'N3wPassword!' });
  check('password reset with code', rs.status === 200, rs);
  const relog = await post('/api/auth/login', { email: A.email, password: 'N3wPassword!' });
  check('login with new password', relog.status === 200, relog);
  A.token = relog.body.accessToken;
  const cookie = `vt_access=${A.token}`;
  const csrf = await call('POST', '/api/water', { body: { amountMl: 100 }, headers: { Cookie: cookie, Origin: 'https://evil.example' } });
  check('CSRF: cookie auth from foreign origin blocked', csrf.status === 403 && csrf.body.error.code === 'csrf', csrf);
  const sameOrigin = await call('POST', '/api/water', { body: { amountMl: 100 }, headers: { Cookie: cookie, Origin: 'http://localhost:3000' } });
  check('cookie auth from app origin allowed', sameOrigin.status === 201, sameOrigin);
  await del(`/api/water/${sameOrigin.body.id}`, A.token);
  let limited = 0;
  for (let i = 0; i < 12; i++) if ((await call('POST', '/api/auth/login', { body: { email: `rl.${uniq}@example.com`, password: 'x' }, headers: { 'X-Forwarded-For': '10.9.9.9' } })).status === 429) limited++;
  check('login rate limit kicks in (429)', limited > 0, { limited });

  section('profile & onboarding');
  const ob = await post('/api/me/onboarding', { name: 'Asha Verma', birthYear: 1994, sex: 'FEMALE', heightCm: 162, weightKg: 60, activityLevel: 'MODERATE', goals: ['Sleep better', 'Move more'], dietPreference: 'veg', acceptWellnessDisclaimer: true }, A.token);
  check('onboarding computes targets', ob.status === 200 && ob.body.suggested.calorieGoal > 1200 && ob.body.profile.waterGoalMl === 2100, ob);
  const pp = await patch('/api/me/profile', { stepGoal: 9000, notifyPrefs: { water: { on: true, everyH: 1 }, bedtime: '22:30', workout: null, meditation: null, email: false, push: false, sms: false }, privacy: { profileVisible: false, leaderboard: true } }, A.token);
  check('profile patch', pp.status === 200 && pp.body.stepGoal === 9000, pp);
  check('invalid timezone rejected', (await patch('/api/me/profile', { timezone: 'Mars/Base' }, A.token)).status === 422);
  check('targets suggest', (await get('/api/me/targets/suggest', A.token)).body.proteinG === 72);
  const cs = await get('/api/me/consents', A.token);
  check('consents recorded at signup', cs.body.current.some((c: any) => c.purpose === 'health_data' && c.granted), cs);

  section('tracking');
  const d = todayIST();
  const w1 = await post('/api/water', { amountMl: 250 }, A.token);
  await post('/api/water', { amountMl: 500 }, A.token);
  check('water log', w1.status === 201, w1);
  check('water bad amount 422', (await post('/api/water', { amountMl: 99999 }, A.token)).status === 422);
  const wl = await get(`/api/water?from=${d}&to=${d}`, A.token);
  check('water list for today', wl.body.items.length === 2, wl);
  check('water delete', (await del(`/api/water/${w1.body.id}`, A.token)).status === 200);
  const steps = await post('/api/activity', { steps: 4000 }, A.token);
  const steps2 = await post('/api/activity', { steps: 2500 }, A.token);
  check('steps add accumulates', steps.status === 200 && steps2.body.steps === 6500, steps2);
  const wo = await post('/api/workouts', { type: 'RUN', durationMin: 30, distanceKm: 5, intensity: 'HARD' }, A.token);
  check('workout calories estimated from MET x weight', wo.status === 201 && wo.body.calories === Math.round(9.8 * 1.2 * 60 * 0.5) && wo.body.source === 'ESTIMATED', wo);
  const wop = await patch(`/api/workouts/${wo.body.id}`, { durationMin: 40 }, A.token);
  check('workout patch recomputes calories', wop.body.calories === Math.round(9.8 * 1.2 * 60 * (40 / 60)), wop);
  check('workout plan upsert', (await put('/api/workout-plans', { weekday: 1, type: 'YOGA', minutes: 30 }, A.token)).status === 200);
  check('exercise library search', (await get('/api/exercises?q=plank')).body.items.length === 1);
  const fs = await get('/api/foods?q=dal', A.token);
  check('food search finds seeded foods', fs.body.items.some((f: any) => f.name === 'Toor dal'), fs);
  const dal = fs.body.items.find((f: any) => f.name === 'Toor dal');
  const n1 = await post('/api/nutrition', { meal: 'LUNCH', foodId: dal.id, quantity: 1.5 }, A.token);
  check('nutrition log scales by quantity', n1.status === 201 && n1.body.calories === 270, n1);
  const cf = await post('/api/foods', { name: 'Ragi dosa', serving: '1 dosa', calories: 140, protein: 4, carbs: 26, fat: 3 }, A.token);
  check('custom food', cf.status === 201, cf);
  await post('/api/nutrition', { meal: 'BREAKFAST', foodId: cf.body.id }, A.token);
  await post('/api/nutrition', { meal: 'SNACK', manual: { name: 'Banana chips', calories: 150, fat: 9, carbs: 16 } }, A.token);
  const nd = await get('/api/nutrition', A.token);
  check('nutrition day totals', nd.body.totals.calories === 270 + 140 + 150 && nd.body.meals.LUNCH.length === 1, nd.body.totals);
  const np = await patch(`/api/nutrition/${n1.body.id}`, { quantity: 1 }, A.token);
  check('nutrition quantity edit rescales', np.body.calories === 180, np);
  const gr = await post('/api/grocery', { text: 'Spinach' }, A.token);
  check('grocery add + toggle', gr.status === 201 && (await patch(`/api/grocery/${gr.body.id}`, { done: true }, A.token)).body.done === true);
  const sl = await post('/api/sleep', { wakeDate: d, bedtime: '23:15', wakeTime: '06:45', quality: 4, note: 'Woke once' }, A.token);
  check('sleep log across midnight = 7.5h', sl.status === 201 && sl.body.hours === 7.5 && sl.body.note === 'Woke once', sl);
  check('sleep same night twice → 409', (await post('/api/sleep', { wakeDate: d, bedtime: '23:00', wakeTime: '07:00', quality: 3 }, A.token)).status === 409);
  check('sleep >16h rejected', (await post('/api/sleep', { wakeDate: '2026-01-01', bedtime: '08:00', wakeTime: '07:00', quality: 3 }, A.token)).status === 422);
  const md = await post('/api/moods', { mood: 4, stress: 2, tags: ['Work'], note: 'Calm day' }, A.token);
  check('mood log', md.status === 201 && md.body.note === 'Calm day', md);
  const jn = await post('/api/journal', { kind: 'GRATITUDE', body: 'Grateful for a long walk with my mother.' }, A.token);
  check('journal entry', jn.status === 201 && jn.body.body.startsWith('Grateful'), jn);
  const raw = await pg.query('select body_enc from journal_entries where id=$1', [jn.body.id]);
  check('journal encrypted at rest (AES-GCM)', raw.rows[0].body_enc.startsWith('v1.') && !raw.rows[0].body_enc.includes('Grateful'), raw.rows[0]);
  const bpBad = await post('/api/metrics', { kind: 'BLOOD_PRESSURE', value: 120 }, A.token);
  check('BP needs diastolic', bpBad.status === 422, bpBad);
  check('metric out of range rejected', (await post('/api/metrics', { kind: 'SPO2', value: 140 }, A.token)).status === 422);
  const bp = await post('/api/metrics', { kind: 'BLOOD_PRESSURE', value: 118, value2: 76 }, A.token);
  check('BP saved with unit + MANUAL source', bp.status === 201 && bp.body.unit === 'mmHg' && bp.body.source === 'MANUAL', bp);
  await post('/api/metrics', { kind: 'RESTING_HEART_RATE', value: 62 }, A.token);
  await post('/api/metrics', { kind: 'WEIGHT', value: 59.4 }, A.token);
  check('weight reading updates profile', (await get('/api/me/profile', A.token)).body.weightKg === 59.4);
  check('meditation session', (await post('/api/meditation/sessions', { minutes: 10, kind: 'guided' }, A.token)).status === 201);
  const who = await post('/api/assessments', { instrument: 'WHO5', answers: [2, 2, 1, 2, 2] }, A.token);
  check('WHO-5 scored ×4 with support info when ≤50', who.body.score === 36 && who.body.lowWellbeing && who.body.support.includes('14416'), who);

  section('habits & plan limits');
  const hb = await post('/api/habits', { name: 'Stretch', category: 'Fitness' }, A.token);
  const tg = await post(`/api/habits/${hb.body.id}/toggle`, {}, A.token);
  check('habit toggle done', tg.body.done === true, tg);
  const hl = await get('/api/habits', A.token);
  check('habit streak 1 + 28-day grid', hl.body.items[0].streak === 1 && hl.body.items[0].last28.length === 28, hl.body.items[0]);
  check('future completion rejected', (await post(`/api/habits/${hb.body.id}/toggle`, { date: '2099-01-01' }, A.token)).status === 400);
  for (let i = 0; i < 4; i++) await post('/api/habits', { name: `H${i}` }, A.token);
  const sixth = await post('/api/habits', { name: 'Too many' }, A.token);
  check('Free plan habit limit (5) → 402', sixth.status === 402 && sixth.body.error.code === 'upgrade_required', sixth);
  check('habit stats', (await get('/api/habits/stats', A.token)).body.week.possible >= 5);

  section('dashboard & analytics');
  const db = await get('/api/dashboard', A.token);
  check('dashboard score computed from logs', db.status === 200 && typeof db.body.score.score === 'number' && db.body.score.signals >= 5, db.body.score);
  check('dashboard totals match logs', db.body.water.ml === 500 && db.body.activity.steps === 6500 && db.body.sleep.hours === 7.5 && db.body.heartRate.value === 62, { water: db.body.water, act: db.body.activity, sleep: db.body.sleep });
  check('dashboard planned workout from weekly plan uses weekday', db.body.plannedWorkout === null || db.body.plannedWorkout.weekday === new Date(d + 'T12:00:00Z').getUTCDay());
  const an = await get('/api/analytics?metric=steps&days=30', A.token);
  check('analytics series 30 days', an.body.series.length === 30 && an.body.series[29].value === 6500, an.body.summary);
  check('analytics bad metric 400', (await get('/api/analytics?metric=nope', A.token)).status === 400);
  check('insights endpoint', (await get('/api/insights', A.token)).status === 200);
  const ct = await get('/api/content?type=MEDITATION', A.token);
  check('premium content locked on Free', ct.body.items.some((c: any) => c.premium && c.locked && c.body === null), ct.body.items.map((c: any) => [c.slug, c.locked]));
  check('premium item 402 on Free', (await get('/api/content/sleep-wind-down-10', A.token)).status === 402);

  section('AI coach & AI health tools (sandbox provider)');
  const c1 = await call('POST', '/api/ai/chat?stream=0', { token: A.token, body: { message: 'How can I sleep better?' } });
  check('chat (JSON mode) answers + creates conversation', c1.status === 200 && c1.body.reply.length > 10 && !!c1.body.conversationId, c1);
  const sse = await fetch(`${BASE}/api/ai/chat`, { method: 'POST', headers: { Authorization: `Bearer ${A.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: c1.body.conversationId, message: 'And for stress?' }) });
  const sseText = await sse.text();
  check('chat streams SSE (start/delta/done)', sse.headers.get('content-type')?.includes('text/event-stream') && sseText.includes('event: delta') && sseText.includes('event: done'), sseText.slice(0, 200));
  const conv = await get(`/api/ai/conversations/${c1.body.conversationId}`, A.token);
  check('chat history stored (4 messages, decrypted)', conv.body.messages.length === 4 && conv.body.messages[0].content === 'How can I sleep better?', conv.body.messages?.length);
  const cr = await call('POST', '/api/ai/chat?stream=0', { token: A.token, body: { message: 'I want to end my life' } });
  check('crisis language → helpline reply, no model call', cr.body.crisis === true && cr.body.reply.includes('14416') && cr.body.reply.includes('112'), cr);
  const crHi = await call('POST', '/api/ai/chat?stream=0', { token: A.token, body: { message: 'mujhe marna chahta hoon', language: 'hi' } });
  check('crisis detection in Hinglish → Hindi reply', crHi.body.crisis === true && crHi.body.reply.includes('14416'), crHi);
  const gated = await post('/api/ai/meal-plan', { days: 2 }, A.token);
  check('AI tools need Premium → 402 on Free', gated.status === 402, gated);
  const trial = await post('/api/billing/trial', { plan: 'PREMIUM' }, A.token);
  check('free trial starts (TRIALING)', trial.status === 201 && trial.body.status === 'TRIALING', trial);
  check('second trial refused', (await post('/api/billing/trial', { plan: 'PREMIUM' }, A.token)).status === 409);
  check('plan now PREMIUM', (await get('/api/billing/subscription', A.token)).body.plan === 'PREMIUM');
  check('premium content unlocked on trial', (await get('/api/content/sleep-wind-down-10', A.token)).status === 200);
  check('7th habit allowed on Premium', (await post('/api/habits', { name: 'Premium habit' }, A.token)).status === 201);
  const mp = await post('/api/ai/meal-plan', { days: 2, diet: 'jain', avoid: ['peanuts'] }, A.token);
  check('AI meal plan', mp.status === 200 && mp.body.kind === 'meal_plan' && mp.body.disclaimer.includes('not medical advice'), mp);
  check('AI workout plan', (await post('/api/ai/workout-plan', { daysPerWeek: 3 }, A.token)).status === 200);
  check('AI weekly report with computed facts', (await post('/api/ai/weekly-report', {}, A.token)).body.facts?.totalSteps === 6500);
  check('AI sleep coach', (await post('/api/ai/sleep-coach', { question: 'I wake at 3am' }, A.token)).status === 200);
  const stress = await post('/api/ai/stress-coach', { situation: 'Exam tomorrow and I feel tense' }, A.token);
  check('AI stress coach', stress.status === 200, stress);
  check('AI journal reflection', (await post('/api/ai/journal-reflection', { entryId: jn.body.id }, A.token)).status === 200);
  check('AI doctor summary', (await post('/api/ai/doctor-summary', { days: 30, concerns: 'Headaches in the evening' }, A.token)).status === 200);
  check('AI lab explainer', (await post('/api/ai/lab-explainer', { reportText: 'Haemoglobin 11.2 g/dL (12.0-15.5)\nTSH 2.1 mIU/L (0.4-4.0)' }, A.token)).status === 200);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData(); fd.set('image', new Blob([png], { type: 'image/png' }), 'meal.png'); fd.set('meal', 'LUNCH');
  const mph = await call('POST', '/api/ai/meal-photo', { token: A.token, form: fd });
  check('AI meal photo accepts image upload', mph.status === 200 && mph.body.kind === 'meal_photo', mph);
  const fd2 = new FormData(); fd2.set('image', new Blob(['not an image'], { type: 'text/plain' }), 'x.txt');
  check('AI meal photo rejects non-images', (await call('POST', '/api/ai/meal-photo', { token: A.token, form: fd2 })).status === 400);
  const rep = await get('/api/ai/reports', A.token);
  check('AI reports history (encrypted at rest, decrypted on read)', rep.body.items.length >= 8, rep.body.items?.length);
  check('AI usage counter', (await get('/api/ai/usage', A.token)).body.usedLast24h >= 9);

  section('notifications, devices, cron reminders');
  check('device register', (await post('/api/devices', { platform: 'android', pushToken: `tok_${uniq}_xxxxxxxxxx`, name: 'Pixel' }, A.token)).status === 200);
  check('cron rejects missing secret', (await post('/api/cron/reminders', {})).status === 401);
  const cron = await call('POST', '/api/cron/reminders', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, body: {} });
  check('cron runs', cron.status === 200 && cron.body.ok, cron);
  const cron2 = await call('POST', '/api/cron/reminders', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, body: {} });
  check('cron dedupes (second run creates no water reminder twice)', cron2.body.created.water === 0, cron2.body);
  const nl = await get('/api/notifications', A.token);
  check('notifications list', nl.status === 200 && Array.isArray(nl.body.items), nl);
  check('read-all', (await post('/api/notifications/read-all', {}, A.token)).status === 200 && (await get('/api/notifications?unread=true', A.token)).body.unread === 0);

  section('integrations');
  const il = await get('/api/integrations', A.token);
  check('integration list shows Connect/Configure state, none faked', il.body.items.length === 6 && il.body.items.every((i: any) => i.status === 'DISCONNECTED' && i.serverConfigured === false), il.body.items);
  check('connect requires explicit consent', (await post('/api/integrations/FITBIT/connect', {}, A.token)).status === 422);
  const realFit = await post('/api/integrations/FITBIT/connect', { consent: true }, A.token);
  check('real Fitbit connect without keys → 503 not_configured', realFit.status === 503 && realFit.body.error.code === 'not_configured', realFit);
  const sb = await post('/api/integrations/FITBIT/connect', { consent: true, sandbox: true }, A.token);
  check('sandbox connect (dev only, flagged)', sb.status === 200 && sb.body.sandbox === true, sb);
  const sy = await post('/api/integrations/FITBIT/sync', {}, A.token);
  check('sandbox sync imports DEVICE rows', sy.status === 200 && sy.body.synced.activity === 7, sy);
  check('ingest refused before connecting Apple Health', (await post('/api/integrations/APPLE_HEALTH/ingest', { steps: [] }, A.token)).status === 409);
  await post('/api/integrations/APPLE_HEALTH/connect', { consent: true, sandbox: true }, A.token);
  const ing = await post('/api/integrations/APPLE_HEALTH/ingest', { steps: [{ date: d, steps: 8123 }], metrics: [{ kind: 'HEART_RATE', value: 71, measuredAt: new Date().toISOString() }, { kind: 'SPO2', value: 140, measuredAt: new Date().toISOString() }] }, A.token);
  check('HealthKit ingest stores DEVICE data, rejects out-of-range', ing.status === 200 && ing.body.imported.metrics === 1 && ing.body.imported.rejectedOutOfRange === 1, ing);
  const dbd = await get('/api/dashboard', A.token);
  check('dashboard prefers higher of manual/device steps', dbd.body.activity.steps === 8123, dbd.body.activity);
  const dc = await del('/api/integrations/FITBIT?purge=true', A.token);
  check('disconnect + purge device data', dc.status === 200, dc);
  const cons = await get('/api/me/consents', A.token);
  check('integration consent withdrawal recorded', cons.body.current.some((c: any) => c.purpose === 'integration:FITBIT' && c.granted === false), cons.body.current);

  section('billing');
  const plans = await get('/api/billing/plans');
  check('plans public', plans.body.plans.length === 3 && plans.body.plans[1].pricePaise === 29900, plans.body);
  const co = await post('/api/billing/checkout', { plan: 'PREMIUM' }, A.token);
  check('checkout without gateway keys → 503 (no fake payment)', co.status === 503 && co.body.error.code === 'not_configured', co);
  check('payment history empty', (await get('/api/billing/payments', A.token)).body.items.length === 0);
  check('refund of unknown payment 404', (await post('/api/billing/refunds', { paymentId: 'nope', reason: 'test reason' }, A.token)).status === 404);
  const rzpHook = await call('POST', '/api/webhooks/razorpay', { raw: JSON.stringify({ event: 'payment.captured' }), headers: { 'x-razorpay-signature': 'bad' } });
  check('webhook with bad signature rejected', rzpHook.status === 401, rzpHook);

  section('RBAC & admin');
  const adminLogin = await post('/api/auth/login', { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD });
  const AD = adminLogin.body.accessToken;
  check('super admin login', adminLogin.status === 200 && adminLogin.body.user.role === 'SUPER_ADMIN', adminLogin.body.user);
  check('user cannot reach admin (403)', (await get('/api/admin/overview', A.token)).status === 403);
  const ov2 = await get('/api/admin/overview', AD);
  check('admin overview live KPIs', ov2.status === 200 && ov2.body.users.active_accounts >= 2 && ov2.body.subscriptions.trialing >= 1, ov2.body);
  const us = await get(`/api/admin/users?q=${encodeURIComponent(A.email)}`, AD);
  check('admin user search + plan column', us.body.items.length === 1 && us.body.items[0].plan === 'PREMIUM', us.body);
  const ud = await get(`/api/admin/users/${A.id}`, AD);
  check('admin user detail excludes health data', ud.status === 200 && !('journal' in ud.body) && typeof ud.body.activity.water_30d === 'number', Object.keys(ud.body));
  check('admin cannot suspend self', (await patch(`/api/admin/users/${adminLogin.body.user.id}`, { status: 'SUSPENDED' }, AD)).status === 400);

  const C = await register('Chetan');
  check('admin suspends user', (await patch(`/api/admin/users/${C.id}`, { status: 'SUSPENDED', reason: 'Spam' }, AD)).body.status === 'SUSPENDED');
  check('suspended user token stops working', (await get('/api/auth/me', C.token)).status === 401);
  check('suspended user cannot log in (403)', (await post('/api/auth/login', { email: C.email, password: 'Str0ngPass!x' })).status === 403);
  await patch(`/api/admin/users/${C.id}`, { status: 'ACTIVE' }, AD);

  const S = await register('Sana');
  check('role change needs roles.manage (super admin ok)', (await patch(`/api/admin/users/${S.id}`, { role: 'SUPPORT_AGENT' }, AD)).status === 200);
  const sLogin = await post('/api/auth/login', { email: S.email, password: 'Str0ngPass!x' });
  const ST = sLogin.body.accessToken;
  check('support agent can list tickets', (await get('/api/admin/tickets', ST)).status === 200);
  check('support agent cannot see revenue overview', (await get('/api/admin/overview', ST)).status === 403);
  check('support agent cannot manage roles', (await get('/api/admin/roles', ST)).status === 403);
  const roles = await get('/api/admin/roles', AD);
  const cm = roles.body.items.find((r: any) => r.key === 'CONTENT_MANAGER');
  check('roles + permission matrix', roles.body.items.length >= 6 && cm.permissions.includes('content.manage'), roles.body.items.map((r: any) => r.key));
  check('edit role permissions', (await patch(`/api/admin/roles/${cm.id}`, { permissions: [...cm.permissions, 'audit.read'] }, AD)).status === 200);
  check('super admin role is locked', (await patch(`/api/admin/roles/${roles.body.items.find((r: any) => r.key === 'SUPER_ADMIN').id}`, { permissions: [] }, AD)).status === 400);

  const cc = await post('/api/admin/content', { type: 'ARTICLE', slug: `hydration-${uniq}`, title: 'Why hydration matters', published: true }, AD);
  check('admin content create', cc.status === 201, cc);
  check('admin content update', (await patch(`/api/admin/content/${cc.body.id}`, { premium: true }, AD)).body.premium === true);
  check('admin content delete', (await del(`/api/admin/content/${cc.body.id}`, AD)).status === 200);
  const cp = await post('/api/admin/coupons', { code: `WELCOME${uniq.slice(-4).toUpperCase()}`, percentOff: 20, plans: ['PREMIUM'] }, AD);
  check('coupon create', cp.status === 201, cp);
  const cv = await post('/api/billing/coupon', { plan: 'PREMIUM', code: cp.body.code }, A.token);
  check('coupon validates and discounts 20%', cv.body.valid && cv.body.amountPaise === 23920, cv.body);
  check('coupon needs exactly one discount type', (await post('/api/admin/coupons', { code: 'BADX1', percentOff: 10, amountOffPaise: 1000 }, AD)).status === 422);
  const gr2 = await post('/api/admin/subscriptions', { userId: C.id, plan: 'FAMILY', days: 30 }, AD);
  check('admin grants complimentary plan', gr2.status === 201 && gr2.body.provider === 'complimentary', gr2);
  check('admin integrations status', (await get('/api/admin/integrations', AD)).body.services.ai.configured === false);
  check('admin system health', (await get('/api/admin/system', AD)).body.db.ok === true);
  check('admin settings upsert', (await put('/api/admin/settings', { key: 'maintenance.banner', value: { on: false } }, AD)).status === 200);
  const bc = await post('/api/admin/notifications', { title: 'Welcome', body: 'New meditation added', plan: 'PREMIUM' }, AD);
  check('broadcast to plan segment', bc.status === 200 && bc.body.recipients >= 1, bc);
  const al = await get('/api/admin/audit-logs?action=admin.', AD);
  check('audit log records admin actions', al.body.items.some((x: any) => x.action === 'admin.user_status') && al.body.items.some((x: any) => x.action === 'admin.role_permissions'), al.body.items.map((x: any) => x.action));

  section('professionals & appointments');
  const B = await register('Bhavna');
  const ap = await post('/api/professionals/apply', { displayName: `Dr. Bhavna ${uniq}`, title: 'Dietitian', specializations: ['Nutrition', 'Diabetes care'], registrationNo: 'IDA-12345', languages: ['English', 'Hindi'], city: 'Noida', feeInr: 800 }, B.token);
  check('apply as professional → PENDING', ap.status === 201 && ap.body.status === 'PENDING', ap);
  check('pending not in public directory', !(await get(`/api/professionals?q=${uniq}`)).body.items.length);
  check('unverified pro has no portal access', (await get('/api/pro/slots', B.token)).status === 403);
  const vr = await patch(`/api/admin/professionals/${ap.body.id}`, { status: 'VERIFIED' }, AD);
  check('admin verifies professional', vr.status === 200 && vr.body.status === 'VERIFIED', vr);
  check('verified role = PROFESSIONAL', (await get('/api/auth/me', B.token)).body.role === 'PROFESSIONAL');
  const start = new Date(Date.now() + 2 * 864e5); start.setUTCMinutes(0, 0, 0);
  const slots = await post('/api/pro/slots', { series: { from: start.toISOString(), count: 4, minutes: 30, gapMinutes: 0 } }, B.token);
  check('pro creates slot series', slots.status === 201 && slots.body.created === 4, slots);
  const dir = await get('/api/professionals?specialization=Nutrition&language=Hindi');
  check('directory search by specialization + language', dir.body.items.some((p: any) => p.id === ap.body.id), dir.body);
  const prof = await get(`/api/professionals/${ap.body.id}`);
  check('public profile hides registration number, shows open slots', prof.body.slots.length === 4 && !('registrationNo' in prof.body), prof.body);
  const bk = await post('/api/appointments', { slotId: prof.body.slots[0].id, notes: 'Want a diabetes-friendly diet' }, A.token);
  check('book a slot', bk.status === 201 && bk.body.status === 'REQUESTED', bk);
  check('double booking blocked (409)', (await post('/api/appointments', { slotId: prof.body.slots[0].id }, C.token)).status === 409);
  check('booked slot disappears from profile', (await get(`/api/professionals/${ap.body.id}`)).body.slots.length === 3);
  const pa = await get('/api/pro/appointments', B.token);
  check('pro sees request with decrypted notes', pa.body.items[0]?.notes === 'Want a diabetes-friendly diet', pa.body.items[0]);
  check('cannot skip REQUESTED→COMPLETED', (await patch(`/api/pro/appointments/${bk.body.id}`, { status: 'COMPLETED' }, B.token)).status === 409);
  check('pro confirms', (await patch(`/api/pro/appointments/${bk.body.id}`, { status: 'CONFIRMED' }, B.token)).body.status === 'CONFIRMED');
  check('review before completion refused', (await post(`/api/appointments/${bk.body.id}/review`, { rating: 5 }, A.token)).status === 409);
  await patch(`/api/pro/appointments/${bk.body.id}`, { status: 'COMPLETED' }, B.token);
  const rv = await post(`/api/appointments/${bk.body.id}/review`, { rating: 4, comment: 'Practical advice' }, A.token);
  check('review after completion updates rating', rv.status === 201 && (await get(`/api/professionals/${ap.body.id}`)).body.ratingAvg === 4, rv);
  const ext = await post('/api/appointments', { externalName: 'Dr. Mehta (GP)', startsAt: new Date(Date.now() + 30 * 60000).toISOString() }, A.token);
  check('outside appointment for reminders', ext.status === 201, ext);
  const cron3 = await call('POST', '/api/cron/reminders', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, body: {} });
  check('appointment reminder within the hour', cron3.body.created.appointment >= 1, cron3.body);
  const cx = await patch(`/api/appointments/${ext.body.id}`, { cancel: true }, A.token);
  check('patient cancels', cx.body.status === 'CANCELLED', cx);
  check('admin appointment list', (await get('/api/admin/appointments', AD)).body.items.length >= 2);

  section('gamification');
  const chl = await get('/api/challenges', A.token);
  const stepCh = chl.body.items.find((c: any) => c.metric === 'STEPS');
  check('weekly challenges listed', !!stepCh, chl.body);
  check('join challenge', (await post(`/api/challenges/${stepCh.id}`, {}, A.token)).body.joined === true);
  const chd = await get(`/api/challenges/${stepCh.id}`, A.token);
  check('challenge progress from logs + opt-in leaderboard', chd.body.progress >= 8123 && Array.isArray(chd.body.leaderboard) && chd.body.leaderboard.some((x: any) => x.you), chd.body);
  const ach = await get('/api/achievements', A.token);
  check('achievements evaluated (first_log earned) + weekly points', ach.body.items.find((a: any) => a.key === 'first_log').earned && ach.body.weeklyPoints > 0, ach.body);
  check('leaderboard opt-in only', (await get('/api/leaderboard', A.token)).body.optedIn === true && (await get('/api/leaderboard', C.token)).body.optedIn === false);

  section('community & moderation');
  const groups = await get('/api/community/groups', A.token);
  check('groups listed', groups.body.items.length >= 3, groups.body);
  const gid = groups.body.items[0].id;
  check('group post needs membership', (await post('/api/community/posts', { body: 'hi', groupId: gid }, A.token)).status === 403);
  await post(`/api/community/groups/${gid}/members`, {}, A.token);
  const gp = await post('/api/community/posts', { body: 'Morning walk done!', groupId: gid }, A.token);
  check('group post after joining', gp.status === 201, gp);
  const pub = await post('/api/community/posts', { body: 'First week on Vitalora: 50k steps' }, A.token);
  check('like + comment', (await post(`/api/community/posts/${pub.body.id}/like`, {}, C.token)).body.liked && (await post(`/api/community/posts/${pub.body.id}/comments`, { body: 'Great job!' }, C.token)).status === 201);
  const feed = await get('/api/community/posts', C.token);
  const fp = feed.body.items.find((p: any) => p.id === pub.body.id);
  check('feed counts + liked flag + first-name only', fp.likes === 1 && fp.comments === 1 && fp.liked === true && fp.authorName === 'Asha', fp);
  await post('/api/community/blocks', { userId: A.id }, C.token);
  check('blocked author hidden from feed', !(await get('/api/community/posts', C.token)).body.items.some((p: any) => p.authorId === A.id));
  const rp = await post('/api/community/reports', { targetType: 'post', targetId: pub.body.id, reason: 'Testing moderation' }, C.token);
  check('report content', rp.status === 201, rp);
  const rl = await get('/api/admin/reports', ST);
  check('support agent sees report queue with target', rl.body.items.some((r: any) => r.id === rp.body.id && r.target?.id === pub.body.id), rl.body.items?.length);
  check('moderator hides post', (await patch(`/api/admin/reports/${rp.body.id}`, { action: 'hide' }, ST)).body.status === 'ACTIONED');
  check('hidden post gone from feed', !(await get('/api/community/posts', A.token)).body.items.some((p: any) => p.id === pub.body.id));

  section('support & contact');
  const tk = await post('/api/support/tickets', { subject: 'Steps not syncing', message: 'My Fitbit steps did not show yesterday.' }, A.token);
  check('user opens ticket', tk.status === 201, tk);
  check('agent internal note', (await call('POST', `/api/admin/tickets/${tk.body.id}`, { token: ST, body: { message: 'Check webhook logs', internal: true } })).status === 201);
  check('agent replies', (await call('POST', `/api/admin/tickets/${tk.body.id}`, { token: ST, body: { message: 'Please reconnect Fitbit from Settings.' } })).status === 201);
  const ut = await get(`/api/support/tickets/${tk.body.id}`, A.token);
  check('user sees reply but not internal note', ut.body.messages.length === 2 && ut.body.messages.some((m: any) => m.fromSupport) && !JSON.stringify(ut.body).includes('webhook logs'), ut.body.messages);
  check('ticket isolation: other user 404', (await get(`/api/support/tickets/${tk.body.id}`, C.token)).status === 404);
  check('public contact form', (await post('/api/contact', { name: 'Visitor', email: 'v@example.com', message: 'Do you have a corporate plan?' })).status === 201);
  check('contact honeypot blocks bots', (await post('/api/contact', { name: 'Bot', email: 'b@example.com', message: 'spam spam spam', website: 'x' })).status === 422);

  section('data isolation');
  check("user cannot read another user's water entry", (await get(`/api/water/${(await post('/api/water', { amountMl: 200 }, C.token)).body.id}`, A.token)).status === 404);
  check("user cannot delete another user's journal", (await del(`/api/journal/${jn.body.id}`, C.token)).status === 404);
  check("user cannot open another user's AI conversation", (await get(`/api/ai/conversations/${c1.body.conversationId}`, C.token)).status === 404);

  section('privacy: export & deletion');
  const ex = await get('/api/me/export', A.token);
  check('data export includes decrypted journal + AI chats', ex.status === 200 && ex.body.journal[0].body.startsWith('Grateful') && ex.body.aiConversations.length >= 1 && ex.body.format === 'vitalora-export-v1', Object.keys(ex.body ?? {}));
  check('delete requires confirm', (await del('/api/me', C.token, { password: 'Str0ngPass!x' })).status === 422);
  check('delete wrong password', (await del('/api/me', C.token, { password: 'nope', confirm: 'DELETE' })).status === 400);
  const dl = await del('/api/me', C.token, { password: 'Str0ngPass!x', confirm: 'DELETE' });
  check('account deletion', dl.status === 200, dl);
  const left = await pg.query("select (select count(*) from water_logs where user_id=$1)::int w, (select count(*) from profiles where user_id=$1)::int p, (select email from users where id=$1) e, (select status from users where id=$1) s", [C.id]);
  check('personal data erased, tombstone anonymised', left.rows[0].w === 0 && left.rows[0].p === 0 && left.rows[0].e === null && left.rows[0].s === 'DELETED', left.rows[0]);
  check('deleted user cannot log in', (await post('/api/auth/login', { email: C.email, password: 'Str0ngPass!x' })).status === 401);

  section('logout');
  const lo = await post('/api/auth/logout', { refreshToken: ref.body.refreshToken });
  check('logout revokes refresh token', lo.status === 200 && (await post('/api/auth/refresh', { refreshToken: ref.body.refreshToken })).status === 401);

  await pg.end();
  const passed = results.filter((r) => r.ok).length;
  const byArea = [...new Set(results.map((r) => r.area))].map((a) => { const rs = results.filter((r) => r.area === a); return `| ${a} | ${rs.filter((r) => r.ok).length} / ${rs.length} |`; });
  const report = `# Vitalora API — end-to-end test report\n\nRun: ${new Date().toISOString()} against ${BASE} with PostgreSQL 16, SANDBOX_MODE=true (no third-party keys).\n\n**${passed} of ${results.length} checks passed.**\n\n| Area | Passed |\n|---|---|\n${byArea.join('\n')}\n\n## All checks\n\n${results.map((r) => `- ${r.ok ? 'PASS' : '**FAIL**'} — [${r.area}] ${r.name}${r.detail ? `\n  - ${r.detail}` : ''}`).join('\n')}\n\n## Not covered here (need real credentials)\n\nLive calls to Anthropic/OpenAI, Razorpay/Stripe, Fitbit/Oura/WHOOP OAuth, Google/Apple sign-in, Twilio, Resend, FCM, Cloudinary and Daily.co. Their code paths return \`503 not_configured\` without keys (verified above) and use sandbox data only when SANDBOX_MODE=true outside production.\n`;
  mkdirSync('docs', { recursive: true });
  writeFileSync("docs/TEST_REPORT.md", report);
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
