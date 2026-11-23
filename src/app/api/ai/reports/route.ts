import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { aiReports } from '@/db/schema';
import { route, paging } from '@/lib/http';
import { decrypt } from '@/lib/crypto';

export const GET = route({}, async ({ user, query }) => {
  const { limit, offset, page } = paging(query);
  const kind = query.get('kind');
  const rows = await db.select().from(aiReports).where(and(eq(aiReports.userId, user.id), kind ? eq(aiReports.kind, kind) : undefined)).orderBy(desc(aiReports.createdAt)).limit(limit).offset(offset);
  return { items: rows.map((r) => { const t = decrypt(r.outputEnc); let output: unknown = t; try { output = JSON.parse(t ?? ''); } catch { /* text */ } return { id: r.id, kind: r.kind, input: r.input, output, provider: r.provider, model: r.model, createdAt: r.createdAt }; }), page, limit };
});
