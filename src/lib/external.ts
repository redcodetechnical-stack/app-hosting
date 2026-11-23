/** Food databases, media uploads and video rooms. */
import { configured, env } from './env';
import { notConfigured, ApiError } from './http';
import { withRetry } from './retry';
import { createHash } from 'node:crypto';

export type ExtFood = { name: string; serving: string; calories: number; protein: number; carbs: number; fat: number; fiber?: number | null; barcode?: string | null; source: string };

const offUA = { 'User-Agent': 'Vitalora/1.0 (support@vitalora.app)' };
function offToFood(p: Record<string, any>): ExtFood | null {
  const n = p.nutriments ?? {};
  const kcal = n['energy-kcal_serving'] ?? n['energy-kcal_100g'];
  if (kcal == null || !p.product_name) return null;
  const per = n['energy-kcal_serving'] != null ? 'serving' : '100g';
  const g = (k: string) => Number(n[`${k}_${per}`] ?? 0);
  return { name: p.product_name, serving: per === 'serving' ? p.serving_size ?? '1 serving' : '100 g', calories: Number(kcal), protein: g('proteins'), carbs: g('carbohydrates'), fat: g('fat'), fiber: g('fiber') || null, barcode: p.code ?? null, source: 'openfoodfacts' };
}

export async function offSearch(q: string): Promise<ExtFood[]> {
  if (!env.openFoodFacts) return [];
  try {
    const u = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&json=1&page_size=10&fields=code,product_name,serving_size,nutriments`;
    const r = await withRetry(() => fetch(u, { headers: offUA, signal: AbortSignal.timeout(6000) }), 2);
    if (!r.ok) return [];
    const j = await r.json();
    return (j.products ?? []).map(offToFood).filter(Boolean) as ExtFood[];
  } catch { return []; }
}

export async function barcodeLookup(code: string): Promise<ExtFood | null> {
  if (configured.nutritionix()) {
    const r = await withRetry(() => fetch(`https://trackapi.nutritionix.com/v2/search/item?upc=${encodeURIComponent(code)}`, { headers: { 'x-app-id': env.nutritionixAppId!, 'x-app-key': env.nutritionixKey! } }));
    if (r.ok) {
      const f = (await r.json()).foods?.[0];
      if (f) return { name: f.food_name, serving: `${f.serving_qty} ${f.serving_unit}`, calories: f.nf_calories, protein: f.nf_protein, carbs: f.nf_total_carbohydrate, fat: f.nf_total_fat, fiber: f.nf_dietary_fiber, barcode: code, source: 'nutritionix' };
    }
  }
  if (!env.openFoodFacts) throw notConfigured('Barcode lookup (Open Food Facts or Nutritionix)');
  const r = await withRetry(() => fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,serving_size,nutriments`, { headers: offUA, signal: AbortSignal.timeout(6000) }), 2).catch(() => null);
  if (!r || !r.ok) return null;
  const j = await r.json();
  return j.status === 1 ? offToFood({ ...j.product, code }) : null;
}

/** Signed direct-upload parameters for Cloudinary (the file never passes through our server). */
export function cloudinaryUploadSignature(folder: string, publicId?: string) {
  if (!configured.cloudinary()) throw notConfigured('Cloudinary media storage');
  const timestamp = Math.floor(Date.now() / 1000);
  const params: Record<string, string | number> = { folder, timestamp, ...(publicId ? { public_id: publicId } : {}) };
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  const signature = createHash('sha1').update(toSign + env.cloudinarySecret).digest('hex');
  return { uploadUrl: `https://api.cloudinary.com/v1_1/${env.cloudinaryCloud}/auto/upload`, apiKey: env.cloudinaryKey, ...params, signature };
}

/** Private Daily.co room that expires 2 hours after the appointment starts. */
export async function createVideoRoom(appointmentId: string, startsAt: Date) {
  if (!configured.video()) return null;
  const r = await withRetry(() => fetch('https://api.daily.co/v1/rooms', {
    method: 'POST', headers: { Authorization: `Bearer ${env.dailyKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `vt-${appointmentId.slice(0, 18)}`, privacy: 'private', properties: { exp: Math.floor(startsAt.getTime() / 1000) + 7200, enable_chat: true } }),
  }));
  if (!r.ok) throw new ApiError(502, 'video_provider_error', 'Could not create the video room');
  return (await r.json()).url as string;
}
