import { route } from '@/lib/http';
import { currentPlan, PLANS } from '@/lib/plans';

export const GET = route({}, async ({ user }) => {
  const { plan, subscription } = await currentPlan(user.id);
  return { plan, planDetails: PLANS[plan], subscription };
});
