import { Suspense } from 'react';
import { requirePagePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/rbac';
import { describeStock } from '@/lib/services/inventory.service';
import { InventoryTable } from '@/components/admin/inventory-table';
import { PageHeader } from '@/components/admin/data-table';
import { StatTile } from '@/components/admin/charts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventory' };

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePagePermission('inventory:read');
  const params = await searchParams;

  const page = Math.max(1, Number(params.page ?? 1));
  const perPage = 30;

  const where = {
    ...(params.q
      ? {
          variant: {
            OR: [
              { sku: { contains: params.q } },
              { name: { contains: params.q } },
              { product: { name: { contains: params.q } } },
            ],
          },
        }
      : {}),
    ...(params.status === 'out' ? { onHand: { lte: 0 } } : {}),
    ...(params.status === 'low' ? { onHand: { gt: 0, lte: 3 } } : {}),
    ...(params.status === 'reserved' ? { reserved: { gt: 0 } } : {}),
  };

  const [rows, total, totals] = await Promise.all([
    prisma.inventory.findMany({
      where,
      include: { variant: { include: { product: { select: { id: true, name: true } } } } },
      orderBy: [{ onHand: 'asc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.inventory.count({ where }),
    prisma.inventory.aggregate({ _sum: { onHand: true, reserved: true }, _count: true }),
  ]);

  const outCount = await prisma.inventory.count({ where: { onHand: { lte: 0 } } });
  const lowCount = await prisma.inventory.count({ where: { onHand: { gt: 0, lte: 3 } } });

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Available stock is on-hand minus what is reserved by unpaid orders. Every change here is written to the movement log."
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="SKUs tracked" value={String(totals._count)} />
        <StatTile label="Units on hand" value={String(totals._sum.onHand ?? 0)} />
        <StatTile label="Reserved" value={String(totals._sum.reserved ?? 0)} hint="Held by unpaid orders" />
        <StatTile label="Needs attention" value={`${outCount + lowCount}`} hint={`${outCount} out · ${lowCount} low`} />
      </section>

      <Suspense fallback={<div className="skeleton h-96 rounded-lg" />}>
        <InventoryTable
          rows={rows.map((row) => {
            const stock = describeStock(row);
            return {
              id: row.variantId,
              variantId: row.variantId,
              sku: row.variant.sku,
              productName: row.variant.product.name,
              productId: row.variant.product.id,
              variantName: row.variant.name,
              onHand: stock.onHand,
              reserved: stock.reserved,
              available: stock.available,
              lowStockThreshold: stock.lowStockThreshold,
              status: stock.status,
            };
          })}
          total={total}
          page={page}
          perPage={perPage}
          canWrite={hasPermission(user.permissions, 'inventory:write')}
        />
      </Suspense>
    </>
  );
}
