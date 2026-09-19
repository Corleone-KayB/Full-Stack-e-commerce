import { ok, route } from '@/lib/api';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** GET /api/auth/me — the signed-in user, or null. Never 401s. */
export const GET = route(async () => ok(await getSessionUser()));
