import { clientIp, ok, parseBody, route, userAgent } from '@/lib/api';
import { assertCsrf, createSession, readGuestToken, verifyPassword } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { enforceRateLimit } from '@/lib/rate-limit';
import { permissionsForRole } from '@/lib/rbac';
import { mergeGuestCart } from '@/lib/services/cart.service';
import { loginSchema } from '@/lib/validation';
import type { RoleKey } from '@/types/enums';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/login
 *
 * Rate limited per IP and per account. The failure message is identical for an
 * unknown address and a wrong password, and verifyPassword burns comparable
 * time on a missing account, so the endpoint does not reveal who has one.
 */
export const POST = route(async (request) => {
  await assertCsrf(request);
  const ip = clientIp(request);
  enforceRateLimit('login', ip);

  const body = await parseBody(request, loginSchema);
  enforceRateLimit('login', `account:${body.email}`);

  const user = await prisma.user.findUnique({ where: { email: body.email }, include: { role: true } });
  const valid = await verifyPassword(body.password, user?.passwordHash ?? null);

  if (!user || !valid || !user.active) {
    await recordAudit({
      action: 'auth.login_failed',
      summary: `Failed sign-in attempt for ${body.email}.`,
      targetType: 'user',
      targetId: user?.id,
      ip,
    });
    throw new AppError('UNAUTHENTICATED', 'That email and password do not match.');
  }

  // Carry the guest's bag and saved items into the account.
  const guestToken = await readGuestToken();
  if (guestToken) {
    await mergeGuestCart(guestToken, user.id).catch(() => undefined);
    await prisma.wishlistItem
      .updateMany({ where: { guestToken }, data: { userId: user.id, guestToken: null } })
      .catch(() => undefined);
  }

  await createSession(user.id, { ip, userAgent: userAgent(request) });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const roleKey = user.role.key as RoleKey;
  await recordAudit({
    actor: { id: user.id, email: user.email },
    action: 'auth.login',
    summary: `Signed in as ${roleKey}.`,
    ip,
    userAgent: userAgent(request),
  });

  return ok({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: roleKey,
    isAdmin: roleKey !== 'CUSTOMER',
    permissions: permissionsForRole(roleKey),
  });
});
