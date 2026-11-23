import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const g = globalThis as unknown as { __vtPool?: Pool };
export const pool = g.__vtPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
if (process.env.NODE_ENV !== 'production') g.__vtPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
