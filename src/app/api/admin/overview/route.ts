import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { route } from '@/lib/http';
import { configured } from '@/lib/env';

const one = async <T = Record<string, number>>(q: ReturnType<typeof sql>) => ((await db.execute(q)).rows[0] as T);
const many = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Record<string, unknown>[];

/** Platform KPIs, all computed live from the database. */
export const GET = route({ perm: 'analytics.read' }, async () => {
  const [users, subs, revenue, engagement, signups, revenueByMonth, planMix, tickets, reportsOpen, prosPending] = await Promise.all([
    one(sql`select count(*) filter (where status='ACTIVE')::int active_accounts, count(*) filter (where status='SUSPENDED')::int suspended, count(*) filter (where created_at > now()-interval '7 days' and status<>'DELETED')::int new_7d, count(*) filter (where created_at > now()-interval '30 days' and status<>'DELETED')::int new_30d, count(*) filter (where last_login_at > now()-interval '1 day')::int dau, count(*) filter (where last_login_at > now()-interval '30 days')::int mau from users`),
    one(sql`select count(*) filter (where status='ACTIVE')::int active_paid, count(*) filter (where status='TRIALING')::int trialing, count(*) filter (where status='CANCELLED' and cancelled_at > now()-interval '30 days')::int churned_30d from subscriptions`),
    one(sql`select coalesce(sum(amount_paise) filter (where status='PAID'),0)::bigint total_paise, coalesce(sum(amount_paise) filter (where status='PAID' and created_at > now()-interval '30 days'),0)::bigint last30_paise, count(*) filter (where status='FAILED' and created_at > now()-interval '30 days')::int failed_30d from payments`),
    one(sql`select (select count(distinct user_id) from water_logs where logged_at > now()-interval '7 days')::int water_loggers_7d, (select count(distinct user_id) from workouts where started_at > now()-interval '7 days')::int workout_loggers_7d, (select count(distinct user_id) from mood_logs where logged_at > now()-interval '7 days')::int mood_loggers_7d, (select count(*) from ai_chat_messages where role='USER' and created_at > now()-interval '7 days')::int ai_messages_7d, (select count(*) from ai_reports where created_at > now()-interval '7 days')::int ai_tools_7d`),
    many(sql`select to_char(date_trunc('day', created_at),'YYYY-MM-DD') as "day", count(*)::int n from users where created_at > now()-interval '30 days' and status<>'DELETED' group by 1 order by 1`),
    many(sql`select to_char(date_trunc('month', created_at),'YYYY-MM') as "month", sum(amount_paise)::bigint paise from payments where status='PAID' and created_at > now()-interval '12 months' group by 1 order by 1`),
    many(sql`select plan, count(*)::int n from subscriptions where status in ('ACTIVE','TRIALING') group by 1`),
    one(sql`select count(*) filter (where status in ('OPEN','PENDING'))::int open from support_tickets`),
    one(sql`select count(*)::int open from reports where status='OPEN'`),
    one(sql`select count(*)::int pending from professionals where status='PENDING'`),
  ]);
  return {
    users, subscriptions: subs, revenue: { ...revenue, total_paise: Number(revenue.total_paise), last30_paise: Number(revenue.last30_paise) }, engagement,
    charts: { signups, revenueByMonth: revenueByMonth.map((r) => ({ ...r, paise: Number(r.paise) })), planMix },
    queues: { openTickets: tickets.open, openReports: reportsOpen.open, professionalsPending: prosPending.pending },
    integrations: Object.fromEntries(Object.entries(configured).map(([k, f]) => [k, f()])),
  };
});
