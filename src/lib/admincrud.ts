import { desc, eq } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { ZodType, ZodTypeDef } from 'zod';
import { db } from '@/db';
import { route, notFound, paging } from './http';
import { audit } from './audit';

/** Admin CRUD for platform-owned tables (content, challenges, coupons, exercises), audited. */
export function adminCrud<C extends Record<string, unknown>>(o: { table: PgTable & { id: PgColumn }; perm: string; name: string; create: ZodType<C, ZodTypeDef, any>; update: ZodType<Partial<C>, ZodTypeDef, any>; order?: PgColumn; prep?: (b: any) => Record<string, unknown> }) {
  const t = o.table as any;
  const prep = o.prep ?? ((b: any) => b);
  return {
    collection: {
      GET: route({ perm: o.perm }, async ({ query }) => { const { limit, offset, page } = paging(query, 200); return { items: await db.select().from(t).orderBy(desc(o.order ?? t.id)).limit(limit).offset(offset), page, limit }; }),
      POST: route({ perm: o.perm, body: o.create }, async ({ user, body, ip }) => {
        const [r] = (await db.insert(t).values(prep(body)).returning()) as any[];
        await audit(user.id, `${o.name}.create`, { type: o.name, id: r.id }, undefined, ip);
        return Response.json(r, { status: 201 });
      }),
    },
    item: {
      GET: route({ perm: o.perm }, async ({ params }) => { const [r] = await db.select().from(t).where(eq(t.id, params.id)); if (!r) throw notFound(); return r; }),
      PATCH: route({ perm: o.perm, body: o.update }, async ({ user, params, body, ip }) => {
        const [r] = (await db.update(t).set(prep(body)).where(eq(t.id, params.id)).returning()) as any[];
        if (!r) throw notFound();
        await audit(user.id, `${o.name}.update`, { type: o.name, id: r.id }, { fields: Object.keys(body) }, ip);
        return r;
      }),
      DELETE: route({ perm: o.perm }, async ({ user, params, ip }) => {
        const r = (await db.delete(t).where(eq(t.id, params.id)).returning()) as any[];
        if (!r.length) throw notFound();
        await audit(user.id, `${o.name}.delete`, { type: o.name, id: params.id }, undefined, ip);
        return { ok: true };
      }),
    },
  };
}
