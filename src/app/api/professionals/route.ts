import { and, arrayContains, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { professionals } from '@/db/schema';
import { route, paging } from '@/lib/http';

/** Public directory of VERIFIED professionals only. ?q=&specialization=&city=&language=&sort=rating|fee */
export const GET = route({ auth: false }, async ({ query }) => {
  const { limit, offset, page } = paging(query, 50);
  const q = query.get('q')?.trim();
  const conds = [eq(professionals.status, 'VERIFIED')];
  if (q) conds.push(or(ilike(professionals.displayName, `%${q}%`), ilike(professionals.title, `%${q}%`), sql`array_to_string(${professionals.specializations}, ',') ilike ${'%' + q + '%'}`)!);
  if (query.get('specialization')) conds.push(arrayContains(professionals.specializations, [query.get('specialization')!]));
  if (query.get('language')) conds.push(arrayContains(professionals.languages, [query.get('language')!]));
  if (query.get('city')) conds.push(ilike(professionals.city, query.get('city')!));
  const order = query.get('sort') === 'fee' ? asc(professionals.feeInr) : desc(professionals.ratingAvg);
  const rows = await db.select({ id: professionals.id, displayName: professionals.displayName, title: professionals.title, specializations: professionals.specializations, languages: professionals.languages, city: professionals.city, yearsExp: professionals.yearsExp, feeInr: professionals.feeInr, ratingAvg: professionals.ratingAvg, ratingCount: professionals.ratingCount, bio: professionals.bio })
    .from(professionals).where(and(...conds)).orderBy(order).limit(limit).offset(offset);
  return { items: rows, page, limit };
});
