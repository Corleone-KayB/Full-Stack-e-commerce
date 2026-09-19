import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, PackageX } from 'lucide-react';
import { requirePagePermission } from '@/lib/auth';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import { getCurrency } from '@/lib/services/currency.service';
import {
  getBestSellers,
  getDashboardSummary,
  getPaymentMethodBreakdown,
  getRecentOrders,
  getRevenueSeries,
  getSalesBySeries,
} from '@/lib/services/analytics.service';
import { lowStockVariants, outOfStockVariants } from '@/lib/services/inventory.service';
import { relativeTime } from '@/lib/utils';
import { AreaChart, BarList, ChartTable, ColumnChart, StatTile } from '@/components/admin/charts';
import { PageHeader, StatusBadge } from '@/components/admin/data-table';
import { Badge } from '@/components/ui';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/types/enums';

export const dynamic = 'force-dynamic';

const PROVIDER_LABELS: Record<string, string> = {
  card: 'Credit / debit card',
  mtn_momo: 'MTN Mobile Money',
  airtel_money: 'Airtel Money',
  simulator: 'Sandbox wallet',
  manual: 'Manual / bank transfer',
};

export default async function AdminDashboardPage() {
  await requirePagePermission('dashboard:view');

  const [summary, series, bestSellers, recentOrders, payments, salesBySeries, low, out, currency] =
    await Promise.all([
      getDashboardSummary(),
      getRevenueSeries(30),
      getBestSellers(6),
      getRecentOrders(6),
      getPaymentMethodBreakdown(),
      getSalesBySeries(),
      lowStockVariants(5),
      outOfStockVariants(5),
      getCurrency('AED'),
    ]);

  const money = (amount: number) => formatMoney(amount, currency);
  const compact = (amount: number) => formatMoneyCompact(amount, currency);

  const monthDelta =
    summary.revenue.previousMonth > 0
      ? ((summary.revenue.month - summary.revenue.previousMonth) / summary.revenue.previousMonth) * 100
      : null;

  const revenuePoints = series.map((point) => ({
    label: point.label,
    value: point.revenue,
    meta: `${point.orders} order${point.orders === 1 ? '' : 's'}`,
  }));
  const orderPoints = series.map((point) => ({ label: point.label, value: point.orders }));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Trading summary for the last 30 days. Figures in ${currency.code}.`}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Revenue · 30 days"
          value={money(summary.revenue.month)}
          delta={monthDelta}
          hint="vs previous 30 days"
          spark={series.slice(-14).map((s) => s.revenue)}
        />
        <StatTile label="Revenue today" value={money(summary.revenue.today)} hint={`${summary.orders.today} orders today`} />
        <StatTile
          label="Average order"
          value={money(summary.averageOrderValue)}
          hint={`${summary.orders.total} orders all time`}
        />
        <StatTile
          label="Customers"
          value={String(summary.customers.total)}
          hint={`${summary.customers.newThisMonth} new this month`}
        />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Pending" value={summary.orders.pending} href="/admin/orders?status=PENDING" tone="caution" />
        <MiniStat label="In progress" value={summary.orders.processing} href="/admin/orders?status=PROCESSING" />
        <MiniStat label="Completed" value={summary.orders.completed} href="/admin/orders?status=DELIVERED" tone="positive" />
        <MiniStat
          label="Cancelled / refunded"
          value={summary.orders.cancelled}
          href="/admin/orders?status=CANCELLED"
        />
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Panel title="Revenue" subtitle="Paid orders, last 30 days">
          <AreaChart
            data={revenuePoints}
            format={{ kind: 'money', currency }}
            ariaLabel={`Revenue per day over the last 30 days, in ${currency.code}`}
          />
          <ChartTable
            caption="Revenue and orders per day"
            columns={['Day', `Revenue (${currency.code})`, 'Orders']}
            rows={series.map((point) => [point.label, money(point.revenue), point.orders])}
          />
        </Panel>

        <Panel title="Payment methods" subtitle="Successful transactions">
          <BarList
            ariaLabel="Successful payment volume by provider"
            emptyMessage="No payments recorded yet."
            data={payments.map((row) => ({
              label: PROVIDER_LABELS[row.provider] ?? row.provider,
              value: row.amount,
              display: compact(row.amount),
              sublabel: `${row.successful} paid${row.failed ? ` · ${row.failed} failed` : ''}`,
            }))}
          />
          <ChartTable
            caption="Payments by provider"
            columns={['Provider', 'Successful', 'Failed', `Volume (${currency.code})`]}
            rows={payments.map((row) => [
              PROVIDER_LABELS[row.provider] ?? row.provider,
              row.successful,
              row.failed,
              money(row.amount),
            ])}
          />
        </Panel>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Panel title="Orders placed" subtitle="All orders per day, last 30 days">
          <ColumnChart
            data={orderPoints}
            format={{ kind: 'count', noun: 'order' }}
            ariaLabel="Orders placed per day over the last 30 days"
          />
        </Panel>

        <Panel title="Sales by series" subtitle="Revenue from paid orders">
          <BarList
            ariaLabel="Revenue by product series"
            emptyMessage="No sales recorded yet."
            data={salesBySeries.slice(0, 6).map((row) => ({
              label: row.label,
              value: row.revenue,
              display: compact(row.revenue),
              sublabel: `${row.units} units`,
            }))}
          />
        </Panel>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Recent orders" action={{ label: 'All orders', href: '/admin/orders' }}>
          {recentOrders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/orders/${order.orderNumber}`}
                    className="-mx-2 flex items-center justify-between gap-4 rounded px-2 py-3 transition-colors hover:bg-ink/[0.03]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] tabular text-ink">{order.orderNumber}</p>
                      <p className="truncate text-xs text-muted">
                        {order.user?.firstName ? `${order.user.firstName} ${order.user.lastName ?? ''}` : order.email}
                        {' · '}
                        {relativeTime(order.placedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge status={order.status} label={ORDER_STATUS_LABELS[order.status as OrderStatus]} />
                      <span className="text-[13px] tabular text-ink">{money(order.grandTotal)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Best sellers" subtitle="Units sold on paid orders">
          <BarList
            ariaLabel="Best-selling SKUs by units sold"
            emptyMessage="No sales recorded yet."
            data={bestSellers.map((row) => ({
              label: row.productName,
              value: row.unitsSold,
              display: `${row.unitsSold} sold`,
              sublabel: row.variantName,
            }))}
          />
        </Panel>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel
          title="Low stock"
          subtitle={`${summary.stock.low} SKU${summary.stock.low === 1 ? '' : 's'} at or below their threshold`}
          action={{ label: 'Manage stock', href: '/admin/inventory' }}
        >
          {low.length === 0 ? (
            <p className="flex items-center gap-2 py-8 text-center text-sm text-muted">
              <AlertTriangle className="h-4 w-4 text-positive" />
              Nothing is running low.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {low.map((row) => (
                <li key={row.variantId} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-ink">{row.variant.product.name}</p>
                    <p className="truncate text-xs text-muted">{row.variant.name}</p>
                  </div>
                  <Badge tone="caution">{row.available} left</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Out of stock"
          subtitle={`${summary.stock.out} SKU${summary.stock.out === 1 ? '' : 's'} unavailable`}
          action={{ label: 'Restock', href: '/admin/inventory?status=out' }}
        >
          {out.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Everything is in stock.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {out.map((row) => (
                <li key={row.variantId} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-ink">{row.variant.product.name}</p>
                    <p className="truncate text-xs text-muted">{row.variant.sku}</p>
                  </div>
                  <PackageX className="h-4 w-4 shrink-0 text-critical" aria-label="Out of stock" />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {action && (
          <Link
            href={action.href}
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted transition-colors hover:text-accent"
          >
            {action.label}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function MiniStat({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href: string;
  tone?: 'caution' | 'positive';
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-5 py-4 transition-colors hover:border-ink/20"
    >
      <span className="text-[13px] text-muted">{label}</span>
      <span
        className={`text-lg font-medium tabular ${
          tone === 'caution' && value > 0 ? 'text-caution' : tone === 'positive' ? 'text-positive' : 'text-ink'
        }`}
      >
        {value}
      </span>
    </Link>
  );
}
