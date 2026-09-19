import { createHash } from 'node:crypto';
import { clientIp, ok, parseBody, route } from '@/lib/api';
import { assertCsrf, hashPassword, newOpaqueToken, revokeAllSessions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { enforceRateLimit } from '@/lib/rate-limit';
import { queueNotification } from '@/lib/services/notification.service';
import { performResetSchema, requestResetSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const TTL_MINUTES = 60;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * POST /api/auth/password — request a reset link.
 *
 * Always answers the same way, whether or not the address has an account: the
 * endpoint must not become an account-enumeration oracle.
 */
export const POST = route(async (request) => {
  await assertCsrf(request);
  enforceRateLimit('passwordReset', clientIp(request));

  const { email } = await parseBody(request, requestResetSchema);
  const user = await prisma.user.findUnique({ where: { email } });

  if (user?.passwordHash) {
    const token = newOpaqueToken(32);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TTL_MINUTES * 60_000),
      },
    });

    const base = process.env.APP_URL ?? 'http://localhost:3000';
    await queueNotification({
      templateKey: 'password.reset',
      to: user.email,
      userId: user.id,
      variables: { resetUrl: `${base}/reset-password?token=${token}` },
    });
  }

  return ok({ sent: true });
});

/** PATCH /api/auth/password — complete a reset with a valid, unused token. */
export const PATCH = route(async (request) => {
  await assertCsrf(request);
  enforceRateLimit('passwordReset', clientIp(request));

  const { token, password } = await parseBody(request, performResetSchema);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError('BAD_REQUEST', 'That reset link is no longer valid. Request a new one.');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(password) },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  // Anyone already signed in with the old password is signed out.
  await revokeAllSessions(record.userId);

  return ok({ reset: true });
});
