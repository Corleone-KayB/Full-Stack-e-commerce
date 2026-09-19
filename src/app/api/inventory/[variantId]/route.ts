import { clientIp, ok, parseBody, route, userAgent } from '@/lib/api';
import { assertCsrf, requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { adjustStock } from '@/lib/services/inventory.service';
import { inventoryAdjustSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ variantId: string }> };

/** GET /api/inventory/[variantId] — current stock plus its movement history. */
export const GET = route<Ctx>(async (_request, { params }) => {
  await requirePermission('inventory:read');
  const { variantId } = await params;

  const [inventory, movements] = await Promise.all([
    prisma.inventory.findUnique({
      where: { variantId },
      include: { variant: { include: { product: { select: { name: true } } } } },
    }),
    prisma.inventoryMovement.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    }),
  ]);

  return ok({ inventory, movements });
});

/** PATCH /api/inventory/[variantId] — increase, decrease or set stock. */
export const PATCH = route<Ctx>(async (request, { params }) => {
  await assertCsrf(request);
  const user = await requirePermission('inventory:write');
  const { variantId } = await params;

  const body = await parseBody(request, inventoryAdjustSchema.omit({ variantId: true }));
  const before = await prisma.inventory.findUnique({
    where: { variantId },
    include: { variant: { select: { sku: true } } },
  });

  const result = await adjustStock({ variantId, ...body, userId: user.id });

  await recordAudit({
    actor: user,
    action: 'inventory.adjusted',
    summary: `${before?.variant.sku ?? variantId}: ${before?.onHand ?? 0} → ${result.onHand} (${body.mode}).`,
    targetType: 'variant',
    targetId: variantId,
    meta: { mode: body.mode, quantity: body.quantity, reason: body.reason },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return ok(result);
});
