import { z } from 'zod';
import { clientIp, ok, parseBody, route } from '@/lib/api';
import { assertCsrf, requirePermission, revokeAllSessions } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError, notFound } from '@/lib/errors';
import { ROLE_KEYS } from '@/types/enums';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  roleKey: z.enum(ROLE_KEYS).optional(),
  active: z.boolean().optional(),
  firstName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
});

/**
 * PATCH /api/admin/users/[id]
 *
 * Two things this refuses on purpose: locking yourself out, and removing the
 * last Super Admin. Both are recoverable only from a database console.
 */
export const PATCH = route<Ctx>(async (request, { params }) => {
  await assertCsrf(request);
  const actor = await requirePermission('user:manage');
  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!target) throw notFound('User not found.');

  const body = await parseBody(request, patchSchema);

  if (id === actor.id && (body.active === false || (body.roleKey && body.roleKey !== actor.role))) {
    throw new AppError('CONFLICT', 'You cannot remove your own access.');
  }

  if (target.role.key === 'SUPER_ADMIN' && (body.active === false || (body.roleKey && body.roleKey !== 'SUPER_ADMIN'))) {
    const remaining = await prisma.user.count({
      where: { role: { key: 'SUPER_ADMIN' }, active: true, NOT: { id } },
    });
    if (remaining === 0) {
      throw new AppError('CONFLICT', 'This is the last active Super Admin. Promote someone else first.');
    }
  }

  if (body.roleKey === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
    throw new AppError('FORBIDDEN', 'Only a Super Admin can grant that role.');
  }

  const role = body.roleKey ? await prisma.role.findUnique({ where: { key: body.roleKey } }) : null;

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(role ? { roleId: role.id } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
      ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
    },
    select: { id: true, email: true, firstName: true, lastName: true, active: true, role: { select: { key: true } } },
  });

  // A role change or a deactivation must take effect immediately, not when the
  // existing session happens to expire.
  if (body.roleKey || body.active === false) await revokeAllSessions(id);

  await recordAudit({
    actor,
    action: body.roleKey ? 'user.role_changed' : 'user.updated',
    summary: body.roleKey
      ? `Changed ${target.email} from ${target.role.key} to ${body.roleKey}.`
      : `Updated ${target.email}.`,
    targetType: 'user',
    targetId: id,
    meta: { from: target.role.key, to: body.roleKey, active: body.active },
    ip: clientIp(request),
  });

  return ok(updated);
});
