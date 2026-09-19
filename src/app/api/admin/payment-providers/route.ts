import { ok, route } from '@/lib/api';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { listAllDescriptors, paymentsEnvironment } from '@/lib/payments/registry';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/payment-providers
 *
 * Reports which adapters are registered, which are actually configured, and
 * why the others are not — with the names of the missing environment
 * variables. It never returns a credential, only whether one is present.
 */
export const GET = route(async () => {
  await requirePermission('payment:read');

  const descriptors = listAllDescriptors();
  const volumes = await prisma.payment.groupBy({
    by: ['provider', 'status'],
    _count: true,
    _sum: { amount: true },
  });

  return ok({
    environment: paymentsEnvironment(),
    providers: descriptors.map((descriptor) => {
      const rows = volumes.filter((v) => v.provider === descriptor.id);
      const successful = rows.find((r) => r.status === 'SUCCESSFUL');
      const failed = rows.filter((r) => ['FAILED', 'EXPIRED', 'CANCELLED'].includes(r.status));
      return {
        ...descriptor,
        stats: {
          successful: typeof successful?._count === 'number' ? successful._count : 0,
          failed: failed.reduce((sum, r) => sum + (typeof r._count === 'number' ? r._count : 0), 0),
          volume: successful?._sum.amount ?? 0,
        },
      };
    }),
  });
});
