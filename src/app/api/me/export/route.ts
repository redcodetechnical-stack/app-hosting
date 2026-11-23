import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import * as s from '@/db/schema';
import { route } from '@/lib/http';
import { decrypt } from '@/lib/crypto';
import { audit } from '@/lib/audit';

/** DPDP / GDPR data portability: everything we hold about the user, decrypted, as one JSON file. */
export const GET = route({ rate: [5, 3600] }, async ({ user, ip }) => {
  const u = user.id;
  const by = <T extends { userId: any }>(t: any) => db.select().from(t).where(eq(t.userId, u)) as Promise<T[]>;
  const [acct] = await db.select({ id: s.users.id, email: s.users.email, phone: s.users.phone, createdAt: s.users.createdAt }).from(s.users).where(eq(s.users.id, u));
  const convs = await by<any>(s.aiConversations);
  const msgs = convs.length ? await db.select().from(s.aiChatMessages).where(inArray(s.aiChatMessages.conversationId, convs.map((c) => c.id))) : [];
  const data = {
    exportedAt: new Date().toISOString(), format: 'vitalora-export-v1', account: acct,
    profile: (await by(s.profiles))[0] ?? null, consents: await by(s.consents),
    water: await by(s.waterLogs), activity: await by(s.activityLogs), workouts: await by(s.workouts), workoutPlans: await by(s.workoutPlans),
    nutrition: await by(s.nutritionLogs), grocery: await by(s.groceryItems),
    sleep: (await by<any>(s.sleepLogs)).map((r) => ({ ...r, note: decrypt(r.noteEnc), noteEnc: undefined })),
    moods: (await by<any>(s.moodLogs)).map((r) => ({ ...r, note: decrypt(r.noteEnc), noteEnc: undefined })),
    journal: (await by<any>(s.journalEntries)).map((r) => ({ id: r.id, kind: r.kind, body: decrypt(r.bodyEnc), createdAt: r.createdAt })),
    assessments: await by(s.assessments), metrics: (await by<any>(s.healthMetrics)).map((r) => ({ ...r, note: decrypt(r.noteEnc), noteEnc: undefined })),
    habits: await by(s.habits), habitCompletions: await by(s.habitCompletions), meditation: await by(s.meditationSessions),
    aiConversations: convs.map((c) => ({ ...c, messages: msgs.filter((m) => m.conversationId === c.id).map((m) => ({ role: m.role, content: decrypt(m.contentEnc), createdAt: m.createdAt })) })),
    aiReports: (await by<any>(s.aiReports)).map((r) => ({ id: r.id, kind: r.kind, input: r.input, output: decrypt(r.outputEnc), createdAt: r.createdAt })),
    appointments: (await by<any>(s.appointments)).map((r) => ({ ...r, notes: decrypt(r.notesEnc), notesEnc: undefined })),
    subscriptions: await by(s.subscriptions), payments: await by(s.payments), notifications: await by(s.notifications),
    integrations: (await by<any>(s.integrations)).map((r) => ({ provider: r.provider, status: r.status, lastSyncAt: r.lastSyncAt })),
    supportTickets: await by(s.supportTickets),
  };
  await audit(u, 'privacy.export', { type: 'user', id: u }, undefined, ip);
  return new Response(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="vitalora-export-${new Date().toISOString().slice(0, 10)}.json"` } });
});
