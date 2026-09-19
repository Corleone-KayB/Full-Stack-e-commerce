import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { getCurrency } from '@/lib/services/currency.service';
import { formatDate } from '@/lib/utils';
import { ProfileForm } from '@/components/store/account-forms';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/types/enums';
import { Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your account', robots: { index: false, follow: false } };

export default async function AccountOverviewPage() {
  const user = await requireUser();

  const [record, orders, currency] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { firstName: true, lastName: true, phone: true, marketingOptIn: true, email: true, createdAt: true },
    }),
    prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { placedAt: 'desc' },
      take: 3,
      select: { id: true, orderNumber: true, status: true, grandTotal: true, currency: true, placedAt: true },
    }),
    getCurrency('AED'),
  ]);

  const spent = await prisma.order.aggregate({
    where: { userId: user.id, paymentStatus: 'SUCCESSFUL' },
    _sum: { grandTotal: true },
    _count: true,
  });

  return (
    <div className="space-y-10">
      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Orders placed" value={String(spent._count)} />
        <Stat label="Total spent" value={formatMoney(spent._sum.grandTotal ?? 0, currency)} />
        <Stat label="Member since" value={record ? formatDate(record.createdAt, { month: 'long', day: undefined }) : '—'} />
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-xl tracking-tight text-ink">Recent orders</h2>
          <Link href="/account/orders" className="text-[13px] text-accent underline-offset-4 hover:underline">
            All orders
          </Link>
        </div>

        {orders.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-surface px-5 py-6 text-sm text-muted">
            You have not ordered yet.{' '}
            <Link href="/shop" className="text-accent underline underline-offset-4">
              Browse devices
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
            {orders.map((order) => (
              <li key={order.id}>
                <Link href={`/order/${order.orderNumber}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-ink/[0.03]">
                  <div className="min-w-0">
                    <p className="text-sm tabular text-ink">{order.orderNumber}</p>
                    <p className="text-xs text-muted">{formatDate(order.placedAt)}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge tone="outline">{ORDER_STATUS_LABELS[order.status as OrderStatus]}</Badge>
                    <span className="text-sm tabular text-ink">{formatMoney(order.grandTotal, currency)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 font-display text-xl tracking-tight text-ink">Your details</h2>
        <ProfileForm
          initial={{
            firstName: record?.firstName ?? '',
            lastName: record?.lastName ?? '',
            phone: record?.phone ?? '',
            marketingOptIn: record?.marketingOptIn ?? false,
          }}
        />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5">
      <p className="eyebrow mb-1.5">{label}</p>
      <p className="text-xl font-medium tabular tracking-tight text-ink">{value}</p>
    </div>
  );
}
