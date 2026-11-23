import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { payments } from '@/db/schema';
import { route } from '@/lib/http';

export const GET = route({}, async ({ user }) => ({ items: await db.select().from(payments).where(eq(payments.userId, user.id)).orderBy(desc(payments.createdAt)) }));
