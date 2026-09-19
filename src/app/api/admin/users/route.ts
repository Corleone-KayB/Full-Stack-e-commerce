import { clientIp, created, ok, parseQuery, parseBody, route } from '@/lib/api';
import { assertCsrf, hashPassword, newOpaqueToken, requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { adminUserSchema, paginationSchema } from '@/lib/validation';
import { ADMIN_ROLE_KEYS, type RoleKey } from '@/types/enums';

export const dynamic = 'force-dynamic';

/** GET /api/admin/users — staff accounts and their roles. */
export const GET = route(async (request) => {
  await requirePermission('user:manage');
  const { page, perPage, q } = parseQuery(request, paginationSchema);

  const where = {
    role: { key: { in: ADMIN_ROLE_KEYS as unknown as string[] } },
    ...(q ? { OR: [{ email: { contains: q } }, { firstName: { contains: q } }, { lastName: { contains: q } }] } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
        role: { select: { key: true, name: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return ok(users, { total, page, perPage });
});

/**
 * POST /api/admin/users — create a staff account.
 *
 * If no password is supplied, a strong temporary one is generated and returned
 * exactly once, so it can be handed over out of band. It is never stored in
 * the clear and never appears in the audit log.
 */
export const POST = route(async (request) => {
  await assertCsrf(request);
  const actor = await requirePermission('user:manage');
  const body = await parseBody(request, adminUserSchema);

  if (body.roleKey === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
    throw new AppError('FORBIDDEN', 'Only a Super Admin can create another Super Admin.');
  }

  const role = await prisma.role.findUnique({ where: { key: body.roleKey } });
  if (!role) throw new AppError('VALIDATION_ERROR', 'Unknown role.');

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw new AppError('CONFLICT', 'An account already exists for that email.');

  const temporaryPassword = body.password ?? `${newOpaqueToken(9)}Aa1!`;
  const user = await prisma.user.create({
    data: {
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      roleId: role.id,
      active: body.active,
      passwordHash: await hashPassword(temporaryPassword),
    },
    select: { id: true, email: true, firstName: true, lastName: true, active: true },
  });

  await recordAudit({
    actor,
    action: 'user.created',
    summary: `Created ${body.roleKey} account for ${body.email}.`,
    targetType: 'user',
    targetId: user.id,
    meta: { role: body.roleKey },
    ip: clientIp(request),
  });

  return created({
    ...user,
    role: body.roleKey as RoleKey,
    temporaryPassword: body.password ? undefined : temporaryPassword,
  });
});
