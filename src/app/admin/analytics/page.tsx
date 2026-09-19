import { requirePagePermission } from '@/lib/auth';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import { getCurrency } from '@/lib/services/currency.service';
import {
  getBestSellers,
  getDashboardSummary,
  getMostViewed,
  getPaymentMethodBreakdown,
  getRevenueSeries,
  getSalesBySeries,
} from '@/lib/services/analytics.service';
import { lowStockVariants } from '@/lib/services/inventory.service';
import { AreaChart, BarList, ChartTable, ColumnChart, StatTile } from '@/components/admin/charts';
import { PageHeader } from '@/components/admin/data-table';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analytics' };

const PROVIDER_LABELS: Record<string, string> = {
  card: 'Credit / debit card',
  mtn_momo: 'MTN Mobile Money',
  airtel_money: 'Airtel Money',
  simulator: 'Sandbox wallet',
};

export default async function AnalyticsPage() {
  await requirePagePermission('analytics:read');

  const [summary, series90, bestSellers, mostViewed, payments, salesBySeries, low, currency] = await Promise.all([
    getDashboardSummary(),
    getRevenueSeries(90),
    getBestSellers(10),
    getMostViewed(8),
    getPaymentMethodBreakdown(),
    getSalesBySeries(),
    lowStockVariants(8),
    getCurrency('AED'),
  ]);

  const money = (amount: number) => formatMoney(amount, currency);
  const compact = (amount: number) => formatMoneyCompact(amount, currency);
  const weekly = groupWeekly(series90);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Computed from your own orders — no third-party tag required. Connect GA4 or another provider later without changing these queries."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Revenue · all time" value={money(summary.revenue.total)} />
        <StatTile label="Average order value" value={money(summary.averageOrderValue)} />
        <StatTile
          label="Conversion"
          value={`${summary.conversionRate}%`}
          hint="orders ÷ product views, 30 days"
        />
        <StatTile label="Customers" value={String(summary.customers.total)} hint={`${summary.customers.newThisMonth} new`} />
      </section>

      <section className="mt-6 rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-1 text-sm font-medium text-ink">Revenue</h2>
        <p className="mb-4 text-xs text-muted">Paid orders, last 90 days</p>
        <AreaChart
          data={series90.map((point) => ({ label: point.label, value: point.revenue, meta: `${point.orders} orders` }))}
          height={260}
          format={{ kind: 'money', currency }}
          ariaLabel={`Revenue per day over the last 90 days, in ${currency.code}`}
        />
        <ChartTable
          caption="Revenue and orders per day, last 90 days"
          columns={['Day', `Revenue (${currency.code})`, 'Orders']}
          rows={series90.map((point) => [point.label, money(point.revenue), point.orders])}
        />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Orders per week" subtitle="Last 13 weeks">
          <ColumnChart
            data={weekly.map((week) => ({ label: week.label, value: week.orders }))}
            height={180}
            format={{ kind: 'count', noun: 'order' }}
            ariaLabel="Orders per week over the last 13 weeks"
          />
        </Panel>

        <Panel title="Revenue per week" subtitle="Last 13 weeks">
          <ColumnChart
            data={weekly.map((week) => ({ label: week.label, value: week.revenue }))}
            height={180}
            format={{ kind: 'money', currency }}
            ariaLabel="Revenue per week over the last 13 weeks"
          />
        </Panel>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Best sellers" subtitle="Units sold on paid orders">
          <BarList
            ariaLabel="Best-selling SKUs"
            data={bestSellers.map((row) => ({
              label: row.productName,
              value: row.unitsSold,
              display: `${row.unitsSold} · ${compact(row.revenue)}`,
              sublabel: row.variantName,
            }))}
          />
        </Panel>

        <Panel title="Most viewed" subtitle="Product page views, last 30 days">
          <BarList
            ariaLabel="Most viewed products"
            emptyMessage="No views recorded yet."
            data={mostViewed.map((row) => ({
              label: row.product.name,
              value: row.views,
              display: `${row.views} views`,
            }))}
          />
        </Panel>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Sales by series" subtitle="Revenue from paid orders">
          <BarList
            ariaLabel="Revenue by product series"
            data={salesBySeries.map((row) => ({
              label: row.label,
              value: row.revenue,
              display: compact(row.revenue),
              sublabel: `${row.units} units`,
            }))}
          />
          <ChartTable
            caption="Revenue by series"
            columns={['Series', 'Units', `Revenue (${currency.code})`]}
            rows={salesBySeries.map((row) => [row.label, row.units, money(row.revenue)])}
          />
        </Panel>

        <Panel title="Payment mix" subtitle="Successful transactions">
          <BarList
            ariaLabel="Payment volume by provider"
            emptyMessage="No payments yet."
            data={payments.map((row) => ({
              label: PROVIDER_LABELS[row.provider] ?? row.provider,
              value: row.amount,
              display: compact(row.amount),
              sublabel: `${row.successful} paid · ${row.failed} failed`,
            }))}
          />
        </Panel>
      </section>

      <section className="mt-5">
        <Panel title="Low stock" subtitle="SKUs at or below their threshold">
          <BarList
            ariaLabel="Low stock SKUs"
            emptyMessage="Nothing is running low."
            data={low.map((row) => ({
              label: row.variant.product.name,
              value: row.available,
              display: `${row.available} left`,
              sublabel: row.variant.name,
            }))}
          />
        </Panel>
      </section>
    </>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5">
      <h2 className="text-sm font-medium text-ink">{title}</h2>
      {subtitle && <p className="mb-4 mt-0.5 text-xs text-muted">{subtitle}</p>}
      {children}
    </div>
  );
}

/** Buckets daily points into ISO weeks for the medium-term view. */
function groupWeekly(points: { date: string; revenue: number; orders: number }[]) {
  const buckets = new Map<string, { revenue: number; orders: number; label: string }>();
  for (const point of points) {
    const date = new Date(`${point.date}T00:00:00Z`);
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? {
      revenue: 0,
      orders: 0,
      label: monday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    };
    bucket.revenue += point.revenue;
    bucket.orders += point.orders;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].slice(-13);
}
