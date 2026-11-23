/* Generic, user-scoped CRUD for simple log resources. Every query is filtered by user_id. */
import { and, desc, eq, gte, lt, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { z, type ZodType, type ZodTypeDef } from 'zod';
import { db } from '@/db';
import { route, notFound, paging, type Ctx } from './http';
import { dayBounds, isDay } from './dates';
import { getProfile } from './wellness';

type Cfg<C, U> = {
  table: PgTable & { id: PgColumn; userId: PgColumn };
  timeCol?: PgColumn;            // timestamp column used for ?from/&to (local dates)
  dateCol?: PgColumn;            // date column used for ?from/&to
  create: ZodType<C, ZodTypeDef, any>;
  update?: ZodType<U, ZodTypeDef, any>;
  toInsert: (b: C, c: Ctx<C>) => Promise<Record<string, unknown>> | Record<string, unknown>;
  toUpdate?: (b: U, c: Ctx<U>, existing: any) => Promise<Record<string, unknown>> | Record<string, unknown>;
  toDto?: (row: any) => unknown;
  rate?: [number, number];
  maxLimit?: number;
};

export function crud<C, U = Partial<C>>(cfg: Cfg<C, U>) {
  const t = cfg.table as any;
  const dto = cfg.toDto ?? ((r: unknown) => r);
  const order = cfg.timeCol ?? cfg.dateCol ?? t.id;

  async function owned(userId: string, id: string) {
    const [row] = await db.select().from(t).where(and(eq(t.id, id), eq(t.userId, userId)));
    if (!row) throw notFound();
    return row;
  }

  const collection = {
    GET: route({}, async (c) => {
      const { limit, offset, page } = paging(c.query, cfg.maxLimit ?? 200);
      const conds: SQL[] = [eq(t.userId, c.user.id)];
      const from = c.query.get('from'), to = c.query.get('to');
      if ((from && isDay(from)) || (to && isDay(to))) {
        if (cfg.timeCol) {
          const tz = (await getProfile(c.user.id)).timezone;
          if (from && isDay(from)) conds.push(gte(cfg.timeCol, dayBounds(from, tz).start));
          if (to && isDay(to)) conds.push(lt(cfg.timeCol, dayBounds(to, tz).end));
        } else if (cfg.dateCol) {
          if (from && isDay(from)) conds.push(gte(cfg.dateCol, from));
          if (to && isDay(to)) conds.push(lt(cfg.dateCol, addOne(to)));
        }
      }
      const rows = await db.select().from(t).where(and(...conds)).orderBy(desc(order)).limit(limit).offset(offset);
      return { items: rows.map(dto), page, limit };
    }),
    POST: route({ body: cfg.create, rate: cfg.rate ?? [120, 60] }, async (c) => {
      const values = await cfg.toInsert(c.body, c);
      const [row] = (await db.insert(t).values({ ...values, userId: c.user.id }).returning()) as any[];
      return Response.json(dto(row), { status: 201 });
    }),
  };

  const item = {
    GET: route({}, async (c) => dto(await owned(c.user.id, c.params.id))),
    PATCH: route({ body: (cfg.update ?? z.object({})) as ZodType<U, ZodTypeDef, any> }, async (c) => {
      const existing = await owned(c.user.id, c.params.id);
      const values = cfg.toUpdate ? await cfg.toUpdate(c.body, c, existing) : (c.body as Record<string, unknown>);
      if (!Object.keys(values).length) return dto(existing);
      const [row] = (await db.update(t).set(values).where(and(eq(t.id, c.params.id), eq(t.userId, c.user.id))).returning()) as any[];
      return dto(row);
    }),
    DELETE: route({}, async (c) => {
      await owned(c.user.id, c.params.id);
      await db.delete(t).where(and(eq(t.id, c.params.id), eq(t.userId, c.user.id)));
      return { ok: true, id: c.params.id };
    }),
  };
  return { collection, item };
}

function addOne(day: string) {
  const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);
}

// shared zod bits
export const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');
export const zIso = z.coerce.date();
export const zText = (max: number) => z.string().trim().min(1).max(max);
