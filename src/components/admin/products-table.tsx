'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Copy, ExternalLink, Trash2 } from 'lucide-react';
import { apiDelete, apiPatch, apiPost, errorMessage } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import { Badge, ConfirmDialog } from '@/components/ui';
import { DataTable, TableToolbar, type Column } from './data-table';

/**
 * Product list.
 *
 * Bulk actions here are the ones a merchant actually asks for on a Monday:
 * publish or unpublish a set of products, and mark a set as featured. Each
 * goes through the same PATCH endpoint (and therefore the same validation and
 * audit trail) as an individual edit.
 */

export interface ProductRow {
  id: string;
  name: string;
  slug: string;
  brand: string;
  series: string | null;
  category: string;
  active: boolean;
  featured: boolean;
  bestseller: boolean;
  variantCount: number;
  totalStock: number;
  lowStock: boolean;
  imageUrl: string | null;
  priceLabel: string;
  updatedAtLabel: string;
}

export function ProductsTable({
  rows,
  total,
  page,
  perPage,
  categories,
  seriesOptions,
}: {
  rows: ProductRow[];
  total: number;
  page: number;
  perPage: number;
  categories: { id: string; name: string }[];
  seriesOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [deleting, setDeleting] = React.useState<ProductRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function patchMany(items: ProductRow[], body: Record<string, unknown>, message: string) {
    try {
      await Promise.all(items.map((row) => apiPatch(`/api/products/${row.id}`, body)));
      toast.success(message, `${items.length} product${items.length === 1 ? '' : 's'} updated.`);
      router.refresh();
    } catch (error) {
      toast.error("Couldn't update", errorMessage(error));
    }
  }

  const columns: Column<ProductRow>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (row) => (
        <div className="flex items-center gap-3">
          <span className="product-ground relative h-10 w-9 shrink-0 overflow-hidden rounded border border-hairline">
            {row.imageUrl && <Image src={row.imageUrl} alt="" fill sizes="36px" className="object-contain p-0.5" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{row.name}</span>
            <span className="block truncate text-xs text-muted">
              {row.series ?? row.category} · {row.variantCount} variant{row.variantCount === 1 ? '' : 's'}
            </span>
          </span>
        </div>
      ),
    },
    { key: 'brand', header: 'Brand', hideBelow: 'lg', render: (row) => <span className="text-muted">{row.brand}</span> },
    { key: 'price', header: 'Price', numeric: true, render: (row) => row.priceLabel },
    {
      key: 'stock',
      header: 'Stock',
      numeric: true,
      hideBelow: 'sm',
      render: (row) => (
        <span className={row.totalStock === 0 ? 'text-critical' : row.lowStock ? 'text-caution' : 'text-ink'}>
          {row.totalStock}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={row.active ? 'positive' : 'neutral'}>{row.active ? 'Live' : 'Draft'}</Badge>
          {row.featured && <Badge tone="accent">Featured</Badge>}
          {row.bestseller && <Badge tone="outline">Best seller</Badge>}
        </div>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      hideBelow: 'lg',
      render: (row) => <span className="text-muted">{row.updatedAtLabel}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '96px',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <a
            href={`/products/${row.slug}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`View ${row.name} on the storefront`}
            className="rounded p-1.5 text-faint transition-colors hover:text-ink"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            aria-label={`Duplicate ${row.name}`}
            onClick={async () => {
              try {
                const copy = await apiPost<{ id: string }>(`/api/admin/products/${row.id}/duplicate`);
                toast.success('Duplicated', 'The copy is saved as a draft.');
                router.push(`/admin/products/${copy.id}`);
              } catch (error) {
                toast.error("Couldn't duplicate", errorMessage(error));
              }
            }}
            className="rounded p-1.5 text-faint transition-colors hover:text-ink"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${row.name}`}
            onClick={() => setDeleting(row)}
            className="rounded p-1.5 text-faint transition-colors hover:text-critical"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <TableToolbar
        searchPlaceholder="Search by name, slug or SKU…"
        filters={[
          {
            name: 'status',
            label: 'All statuses',
            options: [
              { value: 'active', label: 'Live' },
              { value: 'draft', label: 'Draft' },
              { value: 'featured', label: 'Featured' },
            ],
          },
          { name: 'category', label: 'All categories', options: categories.map((c) => ({ value: c.id, label: c.name })) },
          { name: 'series', label: 'All series', options: seriesOptions.map((s) => ({ value: s.id, label: s.name })) },
        ]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        getHref={(row) => `/admin/products/${row.id}`}
        total={total}
        page={page}
        perPage={perPage}
        emptyTitle="No products match"
        emptyBody="Try a different search, or clear the filters."
        bulkActions={[
          { label: 'Publish', run: (items) => patchMany(items, { active: true }, 'Published') },
          { label: 'Unpublish', run: (items) => patchMany(items, { active: false }, 'Unpublished') },
          { label: 'Mark featured', run: (items) => patchMany(items, { featured: true }, 'Featured') },
          { label: 'Remove featured', run: (items) => patchMany(items, { featured: false }, 'Updated') },
        ]}
      />

      <ConfirmDialog
        open={!!deleting}
        loading={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            const result = await apiDelete<{ archived?: boolean } | undefined>(`/api/products/${deleting.id}`);
            toast.success(
              result?.archived ? 'Archived' : 'Deleted',
              result?.archived
                ? 'It appears on existing orders, so it was deactivated rather than removed.'
                : `${deleting.name} has been removed.`,
            );
            router.refresh();
          } catch (error) {
            toast.error("Couldn't delete", errorMessage(error));
          } finally {
            setBusy(false);
            setDeleting(null);
          }
        }}
        title={`Delete ${deleting?.name ?? 'product'}?`}
        body="If this product appears on an existing order it will be deactivated instead of deleted, so order history stays intact."
        confirmLabel="Delete"
        destructive
      />
    </>
  );
}
