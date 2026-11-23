/** Retries a fetch on network errors, 429 and 5xx with exponential backoff + jitter.
 *  Honours Retry-After. Returns the last response (callers inspect .ok). */
export async function withRetry(fn: () => Promise<Response>, tries = 3, baseMs = 400): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fn();
      if (r.status !== 429 && r.status < 500) return r;
      last = r;
      const ra = Number(r.headers.get('retry-after'));
      await sleep(ra ? Math.min(ra * 1000, 10_000) : baseMs * 2 ** i + Math.random() * 200);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(baseMs * 2 ** i + Math.random() * 200);
    }
  }
  return last!;
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
