import { z } from 'zod';
import { clientIp, ok, parseBody, route } from '@/lib/api';
import { assertCsrf } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { enforceRateLimit } from '@/lib/rate-limit';
import { emailSchema } from '@/lib/validation';
import { queueNotification } from '@/lib/services/notification.service';

export const dynamic = 'force-dynamic';

/**
 * Newsletter opt-in.
 *
 * Records consent against an existing customer where there is one, otherwise
 * creates a marketing-only contact. The response is identical either way, so
 * the endpoint cannot be used to test whether an address has an account.
 */
export const POST = route(async (request) => {
  await assertCsrf(request);
  enforceRateLimit('register', clientIp(request));

  const { email } = await parseBody(request, z.object({ email: emailSchema }));

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.marketingOptIn) {
      await prisma.user.update({ where: { id: existing.id }, data: { marketingOptIn: true } });
    }
  } else {
    const role = await prisma.role.findUnique({ where: { key: 'CUSTOMER' } });
    if (role) {
      await prisma.user.create({
        data: { email, roleId: role.id, marketingOptIn: true, passwordHash: null },
      });
    }
  }

  await queueNotification({
    templateKey: 'account.created',
    to: email,
    variables: { firstName: existing?.firstName ?? 'there' },
  });

  return ok({ subscribed: true });
});
