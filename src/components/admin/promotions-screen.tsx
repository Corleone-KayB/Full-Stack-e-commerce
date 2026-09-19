'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { apiDelete, apiPost, errorMessage } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import { Badge, Button, ConfirmDialog, Field, Input, Modal, Select } from '@/components/ui';
import { DataTable, type Column } from './data-table';

/**
 * Scheduled pricing.
 *
 * Deliberately separate from the product editor: a promotion has a life of its
 * own (starts, ends, can be cancelled) and overwriting a list price to run a
 * sale is how shops lose track of what something actually costs.
 */

export interface ScheduleRow {
  id: string;
  label: string | null;
  sku: string;
  productName: string;
  variantName: string;
  listPrice: string;
  price: string;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  live: boolean;
}

export function PromotionsScreen({
  rows,
  variants,
  canWrite,
  currencyCode,
}: {
  rows: ScheduleRow[];
  variants: { id: string; label: string }[];
  canWrite: boolean;
  currencyCode: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<ScheduleRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [form, setForm] = React.useState({
    variantId: '',
    label: '',
    price: '',
    compareAtPrice: '',
    startsAt: new Date().toISOString().slice(0, 10),
    endsAt: '',
    priority: '10',
  });

  const columns: Column<ScheduleRow>[] = [
    {
      key: 'product',
      header: 'SKU',
      render: (row) => (
        <span>
          <span className="block font-medium">{row.productName}</span>
          <span className="block text-xs text-muted">
            {row.variantName} · <span className="font-mono">{row.sku}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'label',
      header: 'Promotion',
      hideBelow: 'sm',
      render: (row) => row.label ?? <span className="text-faint">—</span>,
    },
    {
      key: 'price',
      header: 'Price',
      numeric: true,
      render: (row) => (
        <span>
          <span className="block">{row.price}</span>
          <span className="block text-xs text-faint line-through">{row.listPrice}</span>
        </span>
      ),
    },
    {
      key: 'window',
      header: 'Window',
      hideBelow: 'md',
      render: (row) => (
        <span className="text-muted">
          {new Date(row.startsAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
          {' → '}
          {row.endsAt
            ? new Date(row.endsAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
            : 'no end'}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (row) =>
        row.live ? (
          <Badge tone="positive">Live</Badge>
        ) : !row.active ? (
          <Badge tone="neutral">Off</Badge>
        ) : new Date(row.startsAt) > new Date() ? (
          <Badge tone="info">Scheduled</Badge>
        ) : (
          <Badge tone="neutral">Ended</Badge>
        ),
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            width: '60px',
            render: (row: ScheduleRow) => (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setDeleting(row)}
                  aria-label="Remove promotion"
                  className="rounded p-1.5 text-faint transition-colors hover:text-critical"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      {canWrite && (
        <div className="mb-5 flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            Schedule a promotion
          </Button>
        </div>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        emptyTitle="No scheduled prices"
        emptyBody="Schedule one to run a sale with a start and an end date, without touching the list price."
        emptyAction={canWrite ? <Button onClick={() => setCreating(true)}>Schedule a promotion</Button> : undefined}
      />

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Schedule a promotion"
        description={`Prices in ${currencyCode}. The highest-priority schedule that is inside its window wins.`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await apiPost('/api/admin/price-schedules', {
                    variantId: form.variantId,
                    label: form.label || null,
                    price: Number(form.price),
                    compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
                    startsAt: new Date(form.startsAt).toISOString(),
                    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
                    priority: Number(form.priority) || 0,
                    active: true,
                  });
                  toast.success('Promotion scheduled');
                  setCreating(false);
                  router.refresh();
                } catch (error) {
                  toast.error("Couldn't schedule it", errorMessage(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Schedule
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU" required className="sm:col-span-2">
            <Select value={form.variantId} onChange={(event) => setForm({ ...form, variantId: event.target.value })}>
              <option value="">Choose a variant…</option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Promotion name" className="sm:col-span-2">
            <Input
              value={form.label}
              onChange={(event) => setForm({ ...form, label: event.target.value })}
              placeholder="Autumn event"
            />
          </Field>
          <Field label={`Promotional price (${currencyCode})`} required>
            <Input inputMode="decimal" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
          </Field>
          <Field label="Show as “was”" hint="Leave blank to use the list price.">
            <Input
              inputMode="decimal"
              value={form.compareAtPrice}
              onChange={(event) => setForm({ ...form, compareAtPrice: event.target.value })}
            />
          </Field>
          <Field label="Starts" required>
            <Input type="date" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
          </Field>
          <Field label="Ends" hint="Blank means it runs until switched off.">
            <Input type="date" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />
          </Field>
          <Field label="Priority" hint="Higher wins when two schedules overlap.">
            <Input type="number" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        loading={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            await apiDelete('/api/admin/price-schedules', { id: deleting.id });
            toast.success('Promotion removed', 'The list price applies again immediately.');
            router.refresh();
          } catch (error) {
            toast.error("Couldn't remove it", errorMessage(error));
          } finally {
            setBusy(false);
            setDeleting(null);
          }
        }}
        title="Remove this promotion?"
        body="The variant reverts to its list price straight away. Orders already placed are unaffected."
        confirmLabel="Remove"
        destructive
      />
    </>
  );
}
