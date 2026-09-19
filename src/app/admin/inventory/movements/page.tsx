import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/admin/data-table';
import { Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventory movements' };

const TYPE_TONES: Record<string, 'positive' | 'critical' | 'info' | 'neutral'> = {
  RECEIVE: 'positive',
  RETURN: 'positive',
  RELEASE: 'info',
  RESERVE: 'info',
  FULFILL: 'critical',
  DAMAGE: 'critical',
  ADJUST: 'neutral',
  SET: 'neutral',
};

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function MovementsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePagePermission('inventory:read');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const perPage = 50;

  const [movements, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        variant: { select: { sku: true, name: true, product: { select: { name: true, id: true } } } },
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.inventoryMovement.count(),
  ]);

  return (
    <>
      <PageHeader
        title="Inventory movements"
        description="Every stock change, in order, with who made it and why. This is the audit trail behind the numbers on the stock page."
      />

      <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-2xs uppercase tracking-[0.08em] text-faint">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Change</th>
                <th className="px-4 py-3 text-right font-medium">Resulting</th>
                <th className="px-4 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id} className="border-b border-hairline last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">{formatDateTime(movement.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/products/${movement.variant.product.id}`} className="hover:text-accent">
                      <span className="block font-mono text-xs">{movement.variant.sku}</span>
                      <span className="block text-xs text-muted">{movement.variant.product.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={TYPE_TONES[movement.type] ?? 'neutral'}>{movement.type.toLowerCase()}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    <span className={movement.quantity > 0 ? 'text-positive' : movement.quantity < 0 ? 'text-critical' : ''}>
                      {movement.quantity > 0 ? '+' : ''}
                      {movement.quantity}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular text-muted">
                    {movement.resultingOnHand}
                    {movement.resultingReserved > 0 ? ` (${movement.resultingReserved} held)` : ''}
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    {movement.reason ?? '—'}
                    {movement.user && (
                      <span className="block text-2xs text-faint">
                        {movement.user.firstName ?? movement.user.email}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-hairline px-4 py-3 text-xs text-muted">
          <span className="tabular">
            {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
          </span>
          <span className="flex gap-3">
            {page > 1 && (
              <Link href={`/admin/inventory/movements?page=${page - 1}`} className="text-accent hover:underline">
                Previous
              </Link>
            )}
            {page * perPage < total && (
              <Link href={`/admin/inventory/movements?page=${page + 1}`} className="text-accent hover:underline">
                Next
              </Link>
            )}
          </span>
        </div>
      </div>
    </>
  );
}
