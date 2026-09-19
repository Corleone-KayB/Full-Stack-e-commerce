import { prisma } from '../db';
import { dayKey } from '../utils';

/**
 * Analytics.
 *
 * Computed from the operational tables rather than a third-party tag, so the
 * dashboard works on a fresh install with no external dependency. The shapes
 * returned here are deliberately generic (series of {label, value}) so they
 * can also be pushed to GA4/Segment later without reworking the queries.
 */

const PAID = { paymentStatus: 'SUCCESSFUL' as const };

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

function daysAgo(n: number) {
  return startOfDay(new Date(Date.now() - n * 86_400_000));
}

export interface DashboardSummary {
  revenue: { total: number; today: number; week: number; month: number; previousMonth: number };
  orders: { total: number; today: number; pending: number; processing: number; completed: number; cancelled: number };
  customers: { total: number; newThisMonth: number };
  averageOrderValue: number;
  conversionRate: number;
  stock: { low: number; out: number };
  payments: { provider: string; count: number; amount: number }[];
  currency: string;
}

export async function getDashboardSummary(currency = 'AED'): Promise<DashboardSummary> {
  const today = startOfDay(new Date());
  const week = daysAgo(7);
  const month = daysAgo(30);
  const prevMonthStart = daysAgo(60);

  const [
    revenueAll,
    revenueToday,
    revenueWeek,
    revenueMonth,
    revenuePrevMonth,
    ordersTotal,
    ordersToday,
    statusCounts,
    customersTotal,
    customersMonth,
    lowStock,
    outStock,
    paymentGroups,
    viewsMonth,
  ] = await Promise.all([
    prisma.order.aggregate({ where: PAID, _sum: { grandTotal: true }, _count: true }),
    prisma.order.aggregate({ where: { ...PAID, paidAt: { gte: today } }, _sum: { grandTotal: true } }),
    prisma.order.aggregate({ where: { ...PAID, paidAt: { gte: week } }, _sum: { grandTotal: true } }),
    prisma.order.aggregate({ where: { ...PAID, paidAt: { gte: month } }, _sum: { grandTotal: true } }),
    prisma.order.aggregate({
      where: { ...PAID, paidAt: { gte: prevMonthStart, lt: month } },
      _sum: { grandTotal: true },
    }),
    prisma.order.count(),
    prisma.order.count({ where: { placedAt: { gte: today } } }),
    prisma.order.groupBy({ by: ['status'], _count: true }),
    prisma.user.count({ where: { role: { key: 'CUSTOMER' } } }),
    prisma.user.count({ where: { role: { key: 'CUSTOMER' }, createdAt: { gte: month } } }),
    prisma.inventory.count({ where: { onHand: { gt: 0, lte: 3 } } }),
    prisma.inventory.count({ where: { onHand: { lte: 0 } } }),
    prisma.payment.groupBy({
      by: ['provider'],
      where: { status: 'SUCCESSFUL' },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.productViewStat.aggregate({ where: { day: { gte: dayKey(month) } }, _sum: { views: true } }),
  ]);

  const byStatus = Object.fromEntries(
    statusCounts.map((s) => [s.status, typeof s._count === 'number' ? s._count : 0]),
  );
  const paidCount = revenueAll._count ?? 0;
  const views = viewsMonth._sum.views ?? 0;

  return {
    revenue: {
      total: revenueAll._sum.grandTotal ?? 0,
      today: revenueToday._sum.grandTotal ?? 0,
      week: revenueWeek._sum.grandTotal ?? 0,
      month: revenueMonth._sum.grandTotal ?? 0,
      previousMonth: revenuePrevMonth._sum.grandTotal ?? 0,
    },
    orders: {
      total: ordersTotal,
      today: ordersToday,
      pending: byStatus.PENDING ?? 0,
      processing: (byStatus.PROCESSING ?? 0) + (byStatus.CONFIRMED ?? 0) + (byStatus.READY ?? 0),
      completed: (byStatus.DELIVERED ?? 0) + (byStatus.SHIPPED ?? 0),
      cancelled: (byStatus.CANCELLED ?? 0) + (byStatus.REFUNDED ?? 0),
    },
    customers: { total: customersTotal, newThisMonth: customersMonth },
    averageOrderValue: paidCount ? Math.round((revenueAll._sum.grandTotal ?? 0) / paidCount) : 0,
    // Orders per product view — a defensible proxy until a real analytics
    // provider is connected.
    conversionRate: views > 0 ? Number(((ordersTotal / views) * 100).toFixed(2)) : 0,
    stock: { low: lowStock, out: outStock },
    payments: paymentGroups.map((p) => ({
      provider: p.provider,
      count: typeof p._count === 'number' ? p._count : 0,
      amount: p._sum.amount ?? 0,
    })),
    currency,
  };
}

export interface TimeSeriesPoint {
  label: string;
  date: string;
  revenue: number;
  orders: number;
}

export async function getRevenueSeries(days = 30): Promise<TimeSeriesPoint[]> {
  const since = daysAgo(days - 1);
  const orders = await prisma.order.findMany({
    where: { placedAt: { gte: since } },
    select: { placedAt: true, grandTotal: true, paymentStatus: true },
  });

  const buckets = new Map<string, { revenue: number; orders: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 86_400_000);
    buckets.set(dayKey(d), { revenue: 0, orders: 0 });
  }
  for (const order of orders) {
    const key = dayKey(order.placedAt);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.orders += 1;
    if (order.paymentStatus === 'SUCCESSFUL') bucket.revenue += order.grandTotal;
  }

  return [...buckets.entries()].map(([date, value]) => ({
    date,
    label: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    revenue: value.revenue,
    orders: value.orders,
  }));
}

export async function getBestSellers(limit = 8) {
  const rows = await prisma.orderItem.groupBy({
    by: ['sku', 'productName', 'variantName'],
    where: { order: { paymentStatus: 'SUCCESSFUL' } },
    _sum: { quantity: true, lineTotal: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: limit,
  });
  return rows.map((r) => ({
    sku: r.sku,
    productName: r.productName,
    variantName: r.variantName,
    unitsSold: r._sum.quantity ?? 0,
    revenue: r._sum.lineTotal ?? 0,
  }));
}

export async function getMostViewed(limit = 8) {
  const since = dayKey(daysAgo(30));
  const rows = await prisma.productViewStat.groupBy({
    by: ['productId'],
    where: { day: { gte: since } },
    _sum: { views: true },
    orderBy: { _sum: { views: 'desc' } },
    take: limit,
  });
  const products = await prisma.product.findMany({
    where: { id: { in: rows.map((r) => r.productId) } },
    select: { id: true, name: true, slug: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return rows
    .map((r) => ({ product: byId.get(r.productId), views: r._sum.views ?? 0 }))
    .filter((r): r is { product: { id: string; name: string; slug: string }; views: number } => !!r.product);
}

export async function getSalesBySeries() {
  const items = await prisma.orderItem.findMany({
    where: { order: { paymentStatus: 'SUCCESSFUL' }, variantId: { not: null } },
    select: {
      lineTotal: true,
      quantity: true,
      variant: { select: { product: { select: { series: { select: { name: true } } } } } },
    },
  });
  const map = new Map<string, { revenue: number; units: number }>();
  for (const item of items) {
    const name = item.variant?.product.series?.name ?? 'Other';
    const bucket = map.get(name) ?? { revenue: 0, units: 0 };
    bucket.revenue += item.lineTotal;
    bucket.units += item.quantity;
    map.set(name, bucket);
  }
  return [...map.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

export async function getRecentOrders(limit = 8) {
  return prisma.order.findMany({
    orderBy: { placedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      orderNumber: true,
      email: true,
      grandTotal: true,
      currency: true,
      status: true,
      paymentStatus: true,
      placedAt: true,
      user: { select: { firstName: true, lastName: true } },
      _count: { select: { items: true } },
    },
  });
}

export async function getPaymentMethodBreakdown() {
  const rows = await prisma.payment.groupBy({
    by: ['provider', 'status'],
    _count: true,
    _sum: { amount: true },
  });
  const map = new Map<string, { provider: string; successful: number; failed: number; amount: number }>();
  for (const row of rows) {
    const bucket = map.get(row.provider) ?? { provider: row.provider, successful: 0, failed: 0, amount: 0 };
    const count = typeof row._count === 'number' ? row._count : 0;
    if (row.status === 'SUCCESSFUL') {
      bucket.successful += count;
      bucket.amount += row._sum.amount ?? 0;
    } else if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(row.status)) {
      bucket.failed += count;
    }
    map.set(row.provider, bucket);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}
