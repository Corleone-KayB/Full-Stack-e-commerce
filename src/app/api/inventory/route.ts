import { ok, parseQuery, route } from '@/lib/api';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { describeStock } from '@/lib/services/inventory.service';
import { paginationSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/inventory — stock across every SKU, filterable by state. */
export const GET = route(async (request) => {
  await requirePermission('inventory:read');
  const { page, perPage, q, status } = parseQuery(request, paginationSchema);

  const rows = await prisma.inventory.findMany({
    where: {
      ...(q
        ? {
            variant: {
              OR: [{ sku: { contains: q } }, { name: { contains: q } }, { product: { name: { contains: q } } }],
            },
          }
        : {}),
      ...(status === 'out' ? { onHand: { lte: 0 } } : {}),
      ...(status === 'low' ? { onHand: { gt: 0, lte: 3 } } : {}),
    },
    include: {
      variant: {
        include: { product: { select: { id: true, name: true, slug: true } } },
      },
    },
    orderBy: [{ onHand: 'asc' }, { updatedAt: 'desc' }],
    skip: (page - 1) * perPage,
    take: perPage,
  });

  const total = await prisma.inventory.count();

  return ok(
    rows.map((row) => ({
      ...describeStock(row),
      sku: row.variant.sku,
      variantName: row.variant.name,
      productName: row.variant.product.name,
      productId: row.variant.product.id,
      updatedAt: row.updatedAt,
    })),
    { total, page, perPage },
  );
});
