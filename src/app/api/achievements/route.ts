import { route } from '@/lib/http';
import { evaluateAchievements, weeklyPoints } from '@/lib/gamification';

export const GET = route({}, async ({ user }) => ({ ...(await evaluateAchievements(user.id)), weeklyPoints: await weeklyPoints(user.id) }));
