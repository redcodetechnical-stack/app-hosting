import { and, desc, eq, gte, ilike, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { auditLogs } from '@/db/schema';
import { route, paging } from '@/lib/http';
import { zIso } from '@/lib/crud';

export const GET = route({ perm: 'audit.read' }, async ({ query }) => {
  const { limit, offset, page } = paging(query, 500);
  const c: SQL[] = [];
  if (query.get('actorId')) c.push(eq(auditLogs.actorId, query.get('actorId')!));
  if (query.get('action')) c.push(ilike(auditLogs.action, `${query.get('action')}%`));
  if (query.get('since')) { const d = zIso.safeParse(query.get('since')); if (d.success) c.push(gte(auditLogs.createdAt, d.data)); }
  return { items: await db.select().from(auditLogs).where(c.length ? and(...c) : undefined).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset), page, limit };
});
