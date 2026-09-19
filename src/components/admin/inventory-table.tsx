'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiPatch, errorMessage } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import { Button, Field, Input, Modal, Select } from '@/components/ui';
import { DataTable, StatusBadge, TableToolbar, type Column } from './data-table';

/**
 * Stock management.
 *
 * Adjustments go through the inventory service rather than writing the number
 * directly, so every change produces a movement row with a reason and an
 * author — which is what makes a stock discrepancy explainable a month later.
 */

export interface InventoryRow {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  productId: string;
  variantName: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  status: string;
}

export function InventoryTable({
  rows,
  total,
  page,
  perPage,
  canWrite,
}: {
  rows: InventoryRow[];
  total: number;
  page: number;
  perPage: number;
  canWrite: boolean;
}) {
  const [adjusting, setAdjusting] = React.useState<InventoryRow | null>(null);

  const columns: Column<InventoryRow>[] = [
    {
      key: 'product',
      header: 'SKU',
      render: (row) => (
        <span>
          <span className="block font-mono text-xs text-muted">{row.sku}</span>
          <Link href={`/admin/products/${row.productId}`} className="block truncate font-medium hover:text-accent">
            {row.productName}
          </Link>
          <span className="block truncate text-xs text-muted">{row.variantName}</span>
        </span>
      ),
    },
    { key: 'onHand', header: 'On hand', numeric: true, render: (row) => row.onHand },
    {
      key: 'reserved',
      header: 'Reserved',
      numeric: true,
      hideBelow: 'sm',
      render: (row) => (row.reserved > 0 ? <span className="text-info">{row.reserved}</span> : '—'),
    },
    {
      key: 'available',
      header: 'Available',
      numeric: true,
      render: (row) => (
        <span
          className={
            row.available <= 0 ? 'text-critical' : row.available <= row.lowStockThreshold ? 'text-caution' : 'text-ink'
          }
        >
          {row.available}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            width: '110px',
            render: (row: InventoryRow) => (
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" onClick={() => setAdjusting(row)}>
                  Adjust
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <TableToolbar
        searchPlaceholder="SKU or product name…"
        filters={[
          {
            name: 'status',
            label: 'All stock',
            options: [
              { value: 'low', label: 'Low stock' },
              { value: 'out', label: 'Out of stock' },
              { value: 'reserved', label: 'Has reservations' },
            ],
          },
        ]}
        actions={
          <Link href="/admin/inventory/movements" className="text-[13px] text-accent underline-offset-4 hover:underline">
            Movement history
          </Link>
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        total={total}
        page={page}
        perPage={perPage}
        emptyTitle="No stock records match"
        emptyBody="Try a different search, or clear the filter."
      />

      <AdjustDialog row={adjusting} onClose={() => setAdjusting(null)} />
    </>
  );
}

function AdjustDialog({ row, onClose }: { row: InventoryRow | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = React.useState<'increase' | 'decrease' | 'set'>('increase');
  const [quantity, setQuantity] = React.useState('1');
  const [reason, setReason] = React.useState('');
  const [threshold, setThreshold] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (row) {
      setMode('increase');
      setQuantity('1');
      setReason('');
      setThreshold(String(row.lowStockThreshold));
    }
  }, [row]);

  if (!row) return null;

  const resulting =
    mode === 'increase'
      ? row.onHand + Number(quantity || 0)
      : mode === 'decrease'
        ? Math.max(0, row.onHand - Number(quantity || 0))
        : Number(quantity || 0);

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      title="Adjust stock"
      description={`${row.productName} · ${row.variantName}`}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await apiPatch(`/api/inventory/${row.variantId}`, {
                  mode,
                  quantity: Number(quantity) || 0,
                  reason: reason || undefined,
                  lowStockThreshold: threshold ? Number(threshold) : undefined,
                });
                toast.success('Stock updated', `${row.sku} is now ${resulting} on hand.`);
                onClose();
                router.refresh();
              } catch (error) {
                toast.error("Couldn't adjust stock", errorMessage(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 rounded border border-hairline bg-canvas p-3 text-center">
          <Figure label="On hand" value={row.onHand} />
          <Figure label="Reserved" value={row.reserved} />
          <Figure label="Available" value={row.available} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Action">
            <Select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="increase">Receive / increase</option>
              <option value="decrease">Reduce</option>
              <option value="set">Set exact figure</option>
            </Select>
          </Field>
          <Field label="Quantity">
            <Input type="number" min={0} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </Field>
        </div>

        <Field label="Reason" hint="Shown in the movement log — a stock count, damage, a supplier delivery.">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Stock count" />
        </Field>

        <Field label="Low-stock threshold">
          <Input type="number" min={0} value={threshold} onChange={(event) => setThreshold(event.target.value)} />
        </Field>

        <p className="rounded bg-accent/8 px-3 py-2 text-[13px] text-accent">
          After this change: <strong className="tabular">{resulting}</strong> on hand,{' '}
          <strong className="tabular">{Math.max(0, resulting - row.reserved)}</strong> available.
        </p>
      </div>
    </Modal>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-medium tabular text-ink">{value}</p>
      <p className="text-2xs uppercase tracking-wider text-faint">{label}</p>
    </div>
  );
}
