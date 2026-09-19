import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { getCurrency } from '@/lib/services/currency.service';
import { formatDate } from '@/lib/utils';
import { Badge, EmptyState, LinkButton } from '@/components/ui';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus, type PaymentStatus } from '@/types/enums';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your orders', robots: { index: false, follow: false } };

export default async function AccountOrdersPage() {
  const user = await requireUser();
  const [orders, currency] = await Promise.all([
    prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { placedAt: 'desc' },
      include: { items: { take: 4 } },
    }),
    getCurrency('AED'),
  ]);

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<Package className="h-6 w-6" />}
        title="No orders yet"
        body="When you buy something, it will appear here with tracking and your receipt."
        action={<LinkButton href="/shop">Start shopping</LinkButton>}
        className="rounded-xl border border-hairline bg-surface"
      />
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl tracking-tight text-ink">Your orders</h2>

      {orders.map((order) => (
        <Link
          key={order.id}
          href={`/order/${order.orderNumber}`}
          className="block rounded-xl border border-hairline bg-surface p-5 transition-colors hover:border-ink/20"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm tabular text-ink">{order.orderNumber}</p>
              <p className="mt-0.5 text-xs text-muted">
                {formatDate(order.placedAt)} · {order.items.length} item{order.items.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={order.status === 'DELIVERED' ? 'positive' : order.status === 'CANCELLED' ? 'critical' : 'outline'}>
                {ORDER_STATUS_LABELS[order.status as OrderStatus]}
              </Badge>
              <Badge tone={order.paymentStatus === 'SUCCESSFUL' ? 'positive' : 'caution'}>
                {PAYMENT_STATUS_LABELS[order.paymentStatus as PaymentStatus]}
              </Badge>
              <span className="text-sm tabular font-medium text-ink">{formatMoney(order.grandTotal, currency)}</span>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            {order.items.map((item) => (
              <span
                key={item.id}
                className="product-ground relative h-14 w-12 overflow-hidden rounded border border-hairline"
              >
                {item.imageUrl && <Image src={item.imageUrl} alt="" fill sizes="48px" className="object-contain p-1" />}
              </span>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}
