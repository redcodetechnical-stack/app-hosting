import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { payments, profiles } from '@/db/schema';
import { route, notFound } from '@/lib/http';
import { PLANS, type Plan } from '@/lib/plans';
import { escapeHtml } from '@/lib/messaging';

/** Printable HTML invoice for a paid payment. */
export const GET = route({}, async ({ user, params }) => {
  const [p] = await db.select().from(payments).where(and(eq(payments.id, params.id), eq(payments.userId, user.id)));
  if (!p || !p.invoiceNo) throw notFound('Invoice not found');
  const [pr] = await db.select().from(profiles).where(eq(profiles.userId, user.id));
  const amt = (p.amountPaise / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${p.invoiceNo}</title><style>body{font:15px/1.5 system-ui;color:#172B4D;max-width:720px;margin:40px auto;padding:0 16px}td,th{padding:8px;border-bottom:1px solid #E2E8F0;text-align:left}th:last-child,td:last-child{text-align:right}</style></head><body>
<img src="/logo.png" alt="Vitalora Healthcare" style="height:56px"><h1>Invoice ${escapeHtml(p.invoiceNo)}</h1><p>Date: ${p.updatedAt.toISOString().slice(0, 10)}<br>Billed to: ${escapeHtml(pr?.name ?? user.email ?? 'Customer')}${user.email ? '<br>' + escapeHtml(user.email) : ''}</p>
<table style="width:100%;border-collapse:collapse"><tr><th>Item</th><th>Amount</th></tr><tr><td>Vitalora ${PLANS[(p.plan ?? 'PREMIUM') as Plan].name} plan, 1 month${p.couponCode ? ` (coupon ${escapeHtml(p.couponCode)})` : ''}</td><td>${amt}</td></tr><tr><th>Total paid</th><th>${amt}</th></tr></table>
<p>Payment reference: ${escapeHtml(p.providerPaymentId ?? '')} via ${escapeHtml(p.provider)}. Status: ${p.status}.</p></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
});
