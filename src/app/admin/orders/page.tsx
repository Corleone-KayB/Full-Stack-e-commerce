import { Suspense } from 'react';
import { requirePagePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { getCurrency } from '@/lib/services/currency.service';
import { formatDate } from '@/lib/utils';
import { OrdersTable } from '@/components/admin/orders-table';
import { PageHeader } from '@/components/admin/data-table';
import { ORDER_STATUSES } from '@/types/enums';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Orders' };

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePagePermission('order:read');
  const params = await searchParams;

  const page = Math.max(1, Number(params.page ?? 1));
  const perPage = 25;

  const where = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.payment ? { paymentStatus: params.payment } : {}),
    ...(params.q
      ? {
          OR: [
            { orderNumber: { contains: params.q } },
            { email: { contains: params.q } },
            { phone: { contains: params.q } },
          ],
        }
      : {}),
  };

  const [orders, total, currency] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        user: { select: { firstName: true, lastName: true } },
        payments: { select: { provider: true }, take: 1, orderBy: { createdAt: 'desc' } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
    getCurrency('AED'),
  ]);

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order, with its payment and fulfilment state. Status changes are logged and can notify the customer."
      />

      <Suspense fallback={<div className="skeleton h-96 rounded-lg" />}>
        <OrdersTable
          rows={orders.map((order) => ({
            id: order.id,
            orderNumber: order.orderNumber,
            customer:
              order.user?.firstName ? `${order.user.firstName} ${order.user.lastName ?? ''}`.trim() : order.email,
            email: order.email,
            placedAtLabel: formatDate(order.placedAt),
            itemCount: order._count.items,
            totalLabel: formatMoney(order.grandTotal, currency),
            status: order.status,
            paymentStatus: order.paymentStatus,
            fulfillmentStatus: order.fulfillmentStatus,
            provider: order.payments[0]?.provider ?? null,
            isDemo: order.isDemo,
          }))}
          total={total}
          page={page}
          perPage={perPage}
          statuses={[...ORDER_STATUSES]}
        />
      </Suspense>
    </>
  );
}
