import { desc } from 'drizzle-orm';
import { db } from '@/db';
import { contactMessages } from '@/db/schema';
import { route } from '@/lib/http';

export const GET = route({ perm: 'support.manage' }, async () => ({ items: await db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt)).limit(200) }));
