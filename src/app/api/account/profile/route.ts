import { ok, parseBody, route } from '@/lib/api';
import { assertCsrf, hashPassword, requireUser, revokeAllSessions, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { changePasswordSchema, updateProfileSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** PATCH /api/account/profile — name, phone and marketing preference. */
export const PATCH = route(async (request) => {
  await assertCsrf(request);
  const user = await requireUser();
  const body = await parseBody(request, updateProfileSchema);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
      ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.marketingOptIn !== undefined ? { marketingOptIn: body.marketingOptIn } : {}),
    },
    select: { id: true, email: true, firstName: true, lastName: true, phone: true, marketingOptIn: true },
  });

  return ok(updated);
});

/** POST /api/account/profile — change password. Signs out other devices. */
export const POST = route(async (request) => {
  await assertCsrf(request);
  const user = await requireUser();
  const body = await parseBody(request, changePasswordSchema);

  const record = await prisma.user.findUnique({ where: { id: user.id } });
  const valid = await verifyPassword(body.currentPassword, record?.passwordHash ?? null);
  if (!valid) throw new AppError('UNAUTHENTICATED', 'That is not your current password.');

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.newPassword) },
  });
  await revokeAllSessions(user.id);

  return ok({ changed: true, signedOutElsewhere: true });
});
