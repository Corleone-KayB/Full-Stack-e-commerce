import { clientIp, created, parseBody, route, userAgent } from '@/lib/api';
import { assertCsrf, createSession, hashPassword, readGuestToken } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mergeGuestCart } from '@/lib/services/cart.service';
import { queueNotification } from '@/lib/services/notification.service';
import { registerSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** POST /api/auth/register */
export const POST = route(async (request) => {
  await assertCsrf(request);
  enforceRateLimit('register', clientIp(request));

  const body = await parseBody(request, registerSchema);

  const role = await prisma.role.findUnique({ where: { key: 'CUSTOMER' } });
  if (!role) throw new AppError('INTERNAL', 'Sign-up is unavailable right now.');

  const existing = await prisma.user.findUnique({ where: { email: body.email } });

  // An address that exists only as a newsletter contact has no password yet —
  // completing registration should adopt it rather than refuse.
  if (existing?.passwordHash) {
    throw new AppError('CONFLICT', 'An account already exists for that email. Try signing in instead.');
  }

  const passwordHash = await hashPassword(body.password);
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone ?? null,
          marketingOptIn: body.marketingOptIn ?? existing.marketingOptIn,
        },
      })
    : await prisma.user.create({
        data: {
          email: body.email,
          passwordHash,
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone ?? null,
          marketingOptIn: body.marketingOptIn ?? false,
          roleId: role.id,
        },
      });

  const guestToken = await readGuestToken();
  if (guestToken) {
    await mergeGuestCart(guestToken, user.id);
    await prisma.wishlistItem
      .updateMany({ where: { guestToken }, data: { userId: user.id, guestToken: null } })
      .catch(() => undefined);
  }

  await createSession(user.id, { ip: clientIp(request), userAgent: userAgent(request) });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await queueNotification({
    templateKey: 'account.created',
    to: user.email,
    userId: user.id,
    variables: { firstName: user.firstName ?? 'there' },
  });

  await recordAudit({
    actor: { id: user.id, email: user.email },
    action: 'user.created',
    summary: 'Customer account created.',
    targetType: 'user',
    targetId: user.id,
    ip: clientIp(request),
  });

  return created({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  });
});
