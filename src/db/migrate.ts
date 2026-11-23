import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index';

migrate(db, { migrationsFolder: './drizzle' })
  .then(() => { console.log('Migrations applied'); return pool.end(); })
  .catch((e) => { console.error(e); process.exit(1); });
