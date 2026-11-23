import { z } from 'zod';
import { db } from '@/db';
import { contactMessages } from '@/db/schema';
import { route } from '@/lib/http';

export const POST = route({ auth: false, body: z.object({ name: z.string().trim().min(1).max(80), email: z.string().trim().email().max(120), message: z.string().trim().min(10).max(5000), website: z.string().max(0).optional() }), rate: [3, 3600] }, async ({ body }) => {
  const { website: _honeypot, ...rest } = body;
  await db.insert(contactMessages).values(rest);
  return Response.json({ ok: true, message: 'Thanks, we will reply by email.' }, { status: 201 });
});
