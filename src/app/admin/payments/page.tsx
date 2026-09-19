import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { getCurrency } from '@/lib/services/currency.service';
import { formatDateTime } from '@/lib/utils';
import { PageHeader, StatusBadge } from '@/components/admin/data-table';
import { Badge } from '@/components/ui';
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from '@/types/enums';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Transactions' };

const PROVIDER_LABELS: Record<string, string> = {
  card: 'Card',
  mtn_momo: 'MTN Mobile Money',
  airtel_money: 'Airtel Money',
  simulator: 'Sandbox wallet',
};

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function PaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePagePermission('payment:read');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const perPage = 30;

  const where = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.provider ? { provider: params.provider } : {}),
  };

  const [payments, total, currency] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { order: { select: { orderNumber: true, email: true } }, _count: { select: { events: true } } },
    }),
    prisma.payment.count({ where }),
    getCurrency('AED'),
  ]);

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every payment attempt, successful or not, with the provider events behind it. Nothing here is editable — it is the record of what the provider told us."
        actions={
          <Link
            href="/admin/payments/providers"
            className="rounded border border-hairline px-3 py-2 text-[13px] text-muted transition-colors hover:border-accent hover:text-accent"
          >
            Provider configuration
          </Link>
        }
      />

      <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-2xs uppercase tracking-[0.08em] text-faint">
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Provider</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">When</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b border-hairline last:border-0 hover:bg-ink/[0.025]">
                  <td className="px-4 py-3">
                    <span className="block font-mono text-xs text-muted">{payment.externalRef.slice(0, 18)}…</span>
                    <span className="block text-2xs text-faint">
                      {payment._count.events} event{payment._count.events === 1 ? '' : 's'}
                      {payment.environment === 'sandbox' ? ' · sandbox' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${payment.order.orderNumber}`} className="tabular hover:text-accent">
                      {payment.order.orderNumber}
                    </Link>
                    <span className="block truncate text-xs text-muted">{payment.order.email}</span>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <Badge tone="outline">{PROVIDER_LABELS[payment.provider] ?? payment.provider}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={payment.status}
                      label={PAYMENT_STATUS_LABELS[payment.status as PaymentStatus] ?? payment.status}
                    />
                    {payment.failureMessage && (
                      <span className="mt-1 block max-w-[220px] truncate text-2xs text-critical">
                        {payment.failureMessage}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular">
                    {formatMoney(payment.amount, currency)}
                    {payment.refundedAmount > 0 && (
                      <span className="block text-2xs text-muted">−{formatMoney(payment.refundedAmount, currency)}</span>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-muted lg:table-cell">
                    {formatDateTime(payment.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-hairline px-4 py-3 text-xs text-muted">
          <span className="tabular">{total} transactions</span>
          <span className="flex gap-3">
            {page > 1 && (
              <Link href={`/admin/payments?page=${page - 1}`} className="text-accent hover:underline">
                Previous
              </Link>
            )}
            {page * perPage < total && (
              <Link href={`/admin/payments?page=${page + 1}`} className="text-accent hover:underline">
                Next
              </Link>
            )}
          </span>
        </div>
      </div>
    </>
  );
}
