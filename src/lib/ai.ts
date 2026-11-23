import { configured, env } from './env';
import { notConfigured, ApiError } from './http';
import { withRetry } from './retry';
import { dayStats, getProfile, lastNDays } from './wellness';

export type ChatMsg = { role: 'user' | 'assistant'; content: string };
export type AiImage = { mediaType: string; base64: string };
export type AiResult = { text: string; provider: string; model: string; tokensIn?: number; tokensOut?: number; sandbox?: boolean };

// ---------- safety ----------
const CRISIS_RE = /\b(suicid\w*|kill (my ?self|myself)|end (my|it all)|want to die|don'?t want to live|self[- ]?harm|hurt(ing)? myself|cut(ting)? myself|no reason to live|overdose)\b|khudkushi|marna chah|jeena nahi|mar jaana|आत्महत्या|मरना चाह|जीना नहीं/i;
export const detectCrisis = (t: string) => CRISIS_RE.test(t);

export const CRISIS_REPLY = {
  en: "I'm really sorry you're going through this. You don't have to handle it alone. Please talk to someone right now: in India you can call Tele-MANAS on 14416 or 1-800-891-4416 (free, 24x7, many languages), or emergency services on 112. If you can, reach out to someone you trust and let them know how you're feeling. If you're outside India, please call your local emergency number.",
  hi: 'मुझे बहुत दुख है कि आप इससे गुज़र रहे हैं। आपको यह अकेले नहीं संभालना है। कृपया अभी किसी से बात करें: भारत में Tele-MANAS को 14416 या 1-800-891-4416 पर कॉल करें (मुफ़्त, 24x7, कई भाषाओं में), या आपातकाल में 112 पर कॉल करें। हो सके तो किसी भरोसेमंद व्यक्ति को अभी बताएं कि आप कैसा महसूस कर रहे हैं।',
};

export const SAFETY_RULES = `Safety rules (always follow):
- You are a wellness coach, not a doctor. Never diagnose a medical or mental-health condition and never say a reading or symptom "means" a disease.
- Never recommend, start, stop or dose prescription medicines or supplements. For any medication question, refer to a doctor or pharmacist.
- For symptoms, pain, injury, pregnancy, chronic conditions, eating-disorder signs, or abnormal readings, encourage the user to consult a qualified clinician; for chest pain, breathing difficulty, fainting, stroke signs or severe bleeding say to call 112 / emergency services now.
- If the user mentions self-harm, suicide or crisis, respond with care and give Tele-MANAS 14416 (India, free, 24x7) and emergency 112; give no other advice.
- Do not invent data. Only refer to numbers present in the user context. Say when data is missing.
- Keep advice practical, culturally aware for India (Indian foods, vegetarian options), and safe for general adults.`;

export const langName = (l: string) => (l === 'hi' ? 'Hindi (Devanagari script, simple everyday words)' : 'English');

// ---------- provider calls ----------
function providerInfo() {
  if (env.aiProvider === 'openai') return { provider: 'openai', model: env.openaiModel };
  return { provider: 'anthropic', model: env.anthropicModel };
}
function ensureAi() {
  if (configured.ai()) return 'live' as const;
  if (env.sandbox) return 'sandbox' as const;
  throw notConfigured('AI provider (ANTHROPIC_API_KEY or OPENAI_API_KEY)');
}

function sandboxText(system: string, messages: ChatMsg[]) {
  const last = messages[messages.length - 1]?.content ?? '';
  return `[Sandbox AI response — no AI provider key configured] I received: "${last.slice(0, 120)}". With a provider key, Vitalora would answer here using your data (${system.length} chars of context).`;
}

function anthropicBody(system: string, messages: ChatMsg[], maxTokens: number, images?: AiImage[], stream = false) {
  const msgs = messages.map((m, i) => {
    if (images?.length && i === messages.length - 1 && m.role === 'user')
      return { role: 'user', content: [...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.base64 } })), { type: 'text', text: m.content }] };
    return m;
  });
  return JSON.stringify({ model: env.anthropicModel, max_tokens: maxTokens, system, messages: msgs, stream });
}
function openaiBody(system: string, messages: ChatMsg[], maxTokens: number, images?: AiImage[], stream = false) {
  const msgs: unknown[] = [{ role: 'system', content: system }, ...messages.map((m, i) => {
    if (images?.length && i === messages.length - 1 && m.role === 'user')
      return { role: 'user', content: [...images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mediaType};base64,${im.base64}` } })), { type: 'text', text: m.content }] };
    return m;
  })];
  return JSON.stringify({ model: env.openaiModel, max_tokens: maxTokens, messages: msgs, stream, ...(stream ? { stream_options: { include_usage: true } } : {}) });
}
const anthropicHeaders = () => ({ 'x-api-key': env.anthropicKey!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' });
const openaiHeaders = () => ({ Authorization: `Bearer ${env.openaiKey}`, 'content-type': 'application/json' });

export async function aiComplete(o: { system: string; messages: ChatMsg[]; maxTokens?: number; images?: AiImage[] }): Promise<AiResult> {
  const mode = ensureAi();
  const info = providerInfo();
  if (mode === 'sandbox') return { text: sandboxText(o.system, o.messages), ...info, sandbox: true };
  const max = o.maxTokens ?? 1200;
  if (info.provider === 'anthropic') {
    const r = await withRetry(() => fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: anthropicHeaders(), body: anthropicBody(o.system, o.messages, max, o.images) }));
    const j = await r.json();
    if (!r.ok) throw new ApiError(502, 'ai_error', j?.error?.message ?? 'AI provider error');
    return { text: (j.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join(''), ...info, tokensIn: j.usage?.input_tokens, tokensOut: j.usage?.output_tokens };
  }
  const r = await withRetry(() => fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: openaiHeaders(), body: openaiBody(o.system, o.messages, max, o.images) }));
  const j = await r.json();
  if (!r.ok) throw new ApiError(502, 'ai_error', j?.error?.message ?? 'AI provider error');
  return { text: j.choices?.[0]?.message?.content ?? '', ...info, tokensIn: j.usage?.prompt_tokens, tokensOut: j.usage?.completion_tokens };
}

/** Streams text deltas. Calls onDone with the full text + usage when finished. */
export async function* aiStream(o: { system: string; messages: ChatMsg[]; maxTokens?: number }, onDone: (r: AiResult) => Promise<void>): AsyncGenerator<string> {
  const mode = ensureAi();
  const info = providerInfo();
  if (mode === 'sandbox') {
    const t = sandboxText(o.system, o.messages);
    for (const w of t.match(/\S+\s*/g) ?? []) yield w;
    await onDone({ text: t, ...info, sandbox: true });
    return;
  }
  const max = o.maxTokens ?? 900;
  const r = info.provider === 'anthropic'
    ? await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: anthropicHeaders(), body: anthropicBody(o.system, o.messages, max, undefined, true) })
    : await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: openaiHeaders(), body: openaiBody(o.system, o.messages, max, undefined, true) });
  if (!r.ok || !r.body) throw new ApiError(502, 'ai_error', `AI provider error ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '', tin: number | undefined, tout: number | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const ev = JSON.parse(data);
        let delta = '';
        if (info.provider === 'anthropic') {
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') delta = ev.delta.text;
          if (ev.type === 'message_start') tin = ev.message?.usage?.input_tokens;
          if (ev.type === 'message_delta') tout = ev.usage?.output_tokens;
        } else {
          delta = ev.choices?.[0]?.delta?.content ?? '';
          if (ev.usage) { tin = ev.usage.prompt_tokens; tout = ev.usage.completion_tokens; }
        }
        if (delta) { full += delta; yield delta; }
      } catch { /* partial line */ }
    }
  }
  await onDone({ text: full, ...info, tokensIn: tin, tokensOut: tout });
}

/** Extracts the first JSON object/array from model text. */
export function parseJson<T = unknown>(text: string): T | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const s = m ? m[1] : text;
  const start = s.search(/[[{]/);
  if (start < 0) return null;
  for (let end = s.length; end > start; end--) {
    try { return JSON.parse(s.slice(start, end)) as T; } catch { /* shrink */ }
  }
  return null;
}

/** Compact, factual context of the user's own data for personalised prompts. */
export async function userContext(userId: string, days = 7) {
  const p = await getProfile(userId);
  const ds = lastNDays(days, p.timezone);
  const st = await dayStats(userId, p.timezone, ds);
  const age = p.birthYear ? new Date().getFullYear() - p.birthYear : null;
  const lines = ds.map((d) => {
    const s = st[d];
    return `${d}: sleep ${s.sleepH ?? '-'}h q${s.sleepQuality ?? '-'}, steps ${s.steps || '-'}, water ${s.waterMl || '-'}ml, food ${s.kcalIn || '-'}kcal (P${s.protein} C${s.carbs} F${s.fat}), active ${s.activeMin}min, mood ${s.mood ?? '-'}/5 stress ${s.stress ?? '-'}/5, habits ${s.habitsDone}/${s.habitsTotal}, meditation ${s.meditationMin}min`;
  });
  return {
    profile: p,
    stats: st,
    text: `User profile: ${p.name ?? 'User'}, age ${age ?? 'unknown'}, sex ${p.sex.toLowerCase()}, height ${p.heightCm ?? '?'} cm, weight ${p.weightKg ?? '?'} kg, activity ${p.activityLevel.toLowerCase()}, diet ${p.dietPreference ?? 'not set'}, goals: ${p.goals.join(', ') || 'none'}.
Targets: ${p.calorieGoal} kcal, ${p.waterGoalMl} ml water, ${p.stepGoal} steps, ${p.sleepGoalH} h sleep.
Last ${days} days (local dates, "-" = not logged):
${lines.join('\n')}`,
  };
}
