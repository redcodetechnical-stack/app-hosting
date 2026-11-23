import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/db';
import { exercises } from '@/db/schema';
import { route } from '@/lib/http';

export const GET = route({ auth: false }, async ({ query }) => {
  const q = query.get('q')?.trim(), cat = query.get('category');
  const conds = [eq(exercises.published, true)];
  if (q) conds.push(or(ilike(exercises.name, `%${q}%`), ilike(exercises.muscles, `%${q}%`))!);
  if (cat && cat !== 'All') conds.push(eq(exercises.category, cat));
  return { items: await db.select().from(exercises).where(and(...conds)).orderBy(asc(exercises.name)) };
});
