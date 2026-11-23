import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { assessments } from '@/db/schema';
import { route } from '@/lib/http';

const CRISIS = 'If you are struggling, in India call Tele-MANAS 14416 (free, 24x7) or 112 in an emergency.';
export const GET = route({}, async ({ user }) => ({ items: await db.select().from(assessments).where(eq(assessments.userId, user.id)).orderBy(desc(assessments.createdAt)).limit(50) }));

/** WHO-5 Well-Being Index: 5 answers 0-5, score = raw x 4 (0-100). Screening aid, not a diagnosis. */
export const POST = route({ body: z.object({ instrument: z.literal('WHO5'), answers: z.array(z.number().int().min(0).max(5)).length(5) }) }, async ({ user, body }) => {
  const score = body.answers.reduce((a, b) => a + b, 0) * 4;
  const [r] = await db.insert(assessments).values({ userId: user.id, instrument: 'WHO5', answers: body.answers, score }).returning();
  const low = score <= 50;
  return Response.json({ ...r, interpretation: low ? 'Your answers suggest low well-being over the last two weeks. Talking to a doctor, counsellor or someone you trust may help.' : 'Your answers suggest reasonable well-being over the last two weeks.', lowWellbeing: low, support: low ? CRISIS : undefined, disclaimer: 'WHO-5 is a screening aid, not a diagnosis.' }, { status: 201 });
});
