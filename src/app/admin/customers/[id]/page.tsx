import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { getCurrency } from '@/lib/services/currency.service';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PageHeader, StatusBadge } from '@/components/admin/data-table';
import { StatTile } from '@/components/admin/charts';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/types/enums';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function CustomerPage({ params }: { params: Params }) {
  await requirePagePermission('customer:read');
  const { id } = await params;

  const [customer, currency] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        addresses: true,
        orders: { orderBy: { placedAt: 'desc' }, take: 20 },
      },
    }),
    getCurrency('AED'),
  ]);

  if (!customer) notFound();

  const paid = customer.orders.filter((order) => order.paymentStatus === 'SUCCESSFUL');
  const spent = paid.reduce((sum, order) => sum + order.grandTotal, 0);

  return (
    <>
      <PageHeader
        title={`${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || customer.email}
        description={`${customer.email}${customer.phone ? ` · ${customer.phone}` : ''} · joined ${formatDate(customer.createdAt)}`}
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Orders" value={String(customer.orders.length)} />
        <StatTile label="Lifetime value" value={formatMoney(spent, currency)} />
        <StatTile
          label="Average order"
          value={paid.length ? formatMoney(Math.round(spent / paid.length), currency) : '—'}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className="rounded-lg border border-hairline bg-surface p-5">
          <h2 className="mb-4 text-sm font-medium text-ink">Orders</h2>
          {customer.orders.length === 0 ? (
            <p className="py-6 text-sm text-muted">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {customer.orders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/orders/${order.orderNumber}`}
                    className="-mx-2 flex items-center justify-between gap-4 rounded px-2 py-3 hover:bg-ink/[0.03]"
                  >
                    <span>
                      <span className="block text-[13px] tabular text-ink">{order.orderNumber}</span>
                      <span className="block text-xs text-muted">{formatDateTime(order.placedAt)}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <StatusBadge status={order.status} label={ORDER_STATUS_LABELS[order.status as OrderStatus]} />
                      <span className="text-[13px] tabular text-ink">{formatMoney(order.grandTotal, currency)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-hairline bg-surface p-5">
          <h2 className="mb-4 text-sm font-medium text-ink">Addresses</h2>
          {customer.addresses.length === 0 ? (
            <p className="text-sm text-muted">No saved addresses.</p>
          ) : (
            <ul className="space-y-4">
              {customer.addresses.map((address) => (
                <li key={address.id} className="text-[13px] leading-relaxed text-muted">
                  <span className="block text-ink">{address.label ?? 'Address'}</span>
                  {address.firstName} {address.lastName}
                  <br />
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}
                  <br />
                  {address.city}
                  <br />
                  {address.phone}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 border-t border-hairline pt-4 text-xs text-muted">
            <p>Role: {customer.role.name}</p>
            <p>Marketing: {customer.marketingOptIn ? 'opted in' : 'not opted in'}</p>
            <p>Last sign-in: {customer.lastLoginAt ? formatDateTime(customer.lastLoginAt) : 'never'}</p>
          </div>
        </section>
      </div>
    </>
  );
}
