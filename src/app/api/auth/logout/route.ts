import { clientIp, noContent, route } from '@/lib/api';
import { assertCsrf, destroySession, getSessionUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export const POST = route(async (request) => {
  await assertCsrf(request);
  const user = await getSessionUser();
  await destroySession();
  if (user) {
    await recordAudit({ actor: user, action: 'auth.logout', summary: 'Signed out.', ip: clientIp(request) });
  }
  return noContent();
});
