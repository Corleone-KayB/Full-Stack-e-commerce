'use client';

import * as React from 'react';
import { Badge } from '@/components/ui';
import { DataTable, StatusBadge, TableToolbar, type Column } from './data-table';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus, type PaymentStatus } from '@/types/enums';

const PROVIDER_LABELS: Record<string, string> = {
  card: 'Card',
  mtn_momo: 'MTN',
  airtel_money: 'Airtel',
  simulator: 'Sandbox',
  manual: 'Manual',
};

export interface OrderRow {
  id: string;
  orderNumber: string;
  customer: string;
  email: string;
  placedAtLabel: string;
  itemCount: number;
  totalLabel: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  provider: string | null;
  isDemo: boolean;
}

export function OrdersTable({
  rows,
  total,
  page,
  perPage,
  statuses,
}: {
  rows: OrderRow[];
  total: number;
  page: number;
  perPage: number;
  statuses: string[];
}) {
  const columns: Column<OrderRow>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (row) => (
        <span className="block">
          <span className="flex items-center gap-2">
            <span className="tabular font-medium">{row.orderNumber}</span>
            {row.isDemo && <Badge tone="outline">demo</Badge>}
          </span>
          <span className="block text-xs text-muted">{row.placedAtLabel}</span>
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      hideBelow: 'sm',
      render: (row) => (
        <span className="block">
          <span className="block truncate">{row.customer}</span>
          <span className="block truncate text-xs text-muted">{row.email}</span>
        </span>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      numeric: true,
      hideBelow: 'lg',
      render: (row) => row.itemCount,
    },
    {
      key: 'payment',
      header: 'Payment',
      hideBelow: 'md',
      render: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge
            status={row.paymentStatus}
            label={PAYMENT_STATUS_LABELS[row.paymentStatus as PaymentStatus] ?? row.paymentStatus}
          />
          {row.provider && <span className="text-xs text-faint">{PROVIDER_LABELS[row.provider] ?? row.provider}</span>}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge status={row.status} label={ORDER_STATUS_LABELS[row.status as OrderStatus] ?? row.status} />
      ),
    },
    { key: 'total', header: 'Total', numeric: true, render: (row) => row.totalLabel },
  ];

  return (
    <>
      <TableToolbar
        searchPlaceholder="Order number, email or phone…"
        filters={[
          {
            name: 'status',
            label: 'All statuses',
            options: statuses.map((status) => ({
              value: status,
              label: ORDER_STATUS_LABELS[status as OrderStatus] ?? status,
            })),
          },
          {
            name: 'payment',
            label: 'Any payment',
            options: (['PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED'] as const).map((status) => ({
              value: status,
              label: PAYMENT_STATUS_LABELS[status],
            })),
          },
        ]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        getHref={(row) => `/admin/orders/${row.orderNumber}`}
        total={total}
        page={page}
        perPage={perPage}
        emptyTitle="No orders match"
        emptyBody="Try a different search, or clear the filters."
      />
    </>
  );
}
