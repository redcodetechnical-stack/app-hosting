import { db } from '@/db';
import { auditLogs } from '@/db/schema';

export async function audit(actorId: string | null, action: string, target?: { type: string; id: string } | null, meta?: Record<string, unknown>, ip?: string) {
  try {
    await db.insert(auditLogs).values({ actorId, action, targetType: target?.type, targetId: target?.id, meta: meta ?? null, ip });
  } catch (e) {
    console.error('[audit] failed', action, e);
  }
}
