import { route } from '@/lib/http';
import { getProfile, suggestTargets } from '@/lib/wellness';

export const GET = route({}, async ({ user }) => suggestTargets(await getProfile(user.id)));
