import { route, badRequest } from '@/lib/http';
import { db } from '@/db';
import { nutritionLogs } from '@/db/schema';
import { checkAiAccess, runTool } from '@/lib/aitools';
import { getProfile } from '@/lib/wellness';

type Est = { items: { name: string; portion: string; calories: number; protein: number; carbs: number; fat: number; confidence: 'low' | 'medium' | 'high' }[]; notes?: string };
const MEALS = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

/** Photo → estimated foods & macros (multipart: image, meal, log=true to save). Saved rows are tagged AI_ESTIMATED. */
export const POST = route({ rate: [15, 3600] }, async ({ user, req }) => {
  await checkAiAccess(user.id, ['PREMIUM', 'FAMILY']);
  const f = await req.formData().catch(() => null);
  const img = f?.get('image');
  if (!(img instanceof File)) throw badRequest('Send the photo as multipart field "image"');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(img.type)) throw badRequest('Use a JPEG, PNG or WebP image');
  if (img.size > 5 * 1024 * 1024) throw badRequest('Image must be under 5 MB');
  const meal = String(f!.get('meal') ?? 'LUNCH').toUpperCase();
  if (!MEALS.includes(meal)) throw badRequest('meal must be BREAKFAST, LUNCH, DINNER or SNACK');
  const p = await getProfile(user.id);
  const r = await runTool<Est>({
    userId: user.id, kind: 'meal_photo', language: p.language, json: true, input: { meal, bytes: img.size },
    images: [{ mediaType: img.type, base64: Buffer.from(await img.arrayBuffer()).toString('base64') }],
    task: 'Identify the foods in a meal photo (Indian dishes are common) and estimate portion and nutrition per item. Be conservative and mark confidence honestly. If the image is not food, return an empty items list and explain in notes.',
    prompt: 'Return JSON: {"items":[{"name":string,"portion":string,"calories":number,"protein":number,"carbs":number,"fat":number,"confidence":"low"|"medium"|"high"}],"notes":string}',
  });
  let logged: unknown[] = [];
  if (String(f!.get('log')) === 'true' && Array.isArray(r.output?.items) && r.output.items.length) {
    logged = await db.insert(nutritionLogs).values(r.output.items.slice(0, 12).map((i) => ({ userId: user.id, name: String(i.name).slice(0, 80), serving: String(i.portion ?? '1 serving').slice(0, 40), quantity: 1, meal: meal as never, calories: Math.max(0, +i.calories || 0), protein: Math.max(0, +i.protein || 0), carbs: Math.max(0, +i.carbs || 0), fat: Math.max(0, +i.fat || 0), source: 'AI_ESTIMATED' as const, eatenAt: new Date() }))).returning();
  }
  return { ...r, logged, label: 'AI estimate from a photo. Check portions before relying on these numbers.' };
});
