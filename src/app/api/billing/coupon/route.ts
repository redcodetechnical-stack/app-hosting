import { z } from 'zod';
import { route } from '@/lib/http';
import { priceWithCoupon } from '@/lib/billing';
import { PLANS } from '@/lib/plans';

export const POST = route({ body: z.object({ plan: z.enum(['PREMIUM', 'FAMILY']), code: z.string().max(40) }), rate: [20, 600] }, async ({ body }) => {
  const r = await priceWithCoupon(body.plan, body.code);
  return { valid: !!r.coupon, originalPaise: PLANS[body.plan].pricePaise, amountPaise: r.amountPaise };
});
