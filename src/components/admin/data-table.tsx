'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, Button, EmptyState, Select, Skeleton } from '@/components/ui';

/**
 * Admin table.
 *
 * One table used across products, orders, customers, payments and inventory:
 * search and filters live in the URL (so a filtered view is linkable and the
 * back button works), rows can be selected for bulk actions, and every state —
 * loading, empty, error — is a designed one rather than a blank screen.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** Right-align numeric columns. */
  numeric?: boolean;
  /** Hide below the given breakpoint to keep phones readable. */
  hideBelow?: 'sm' | 'md' | 'lg';
  width?: string;
  render: (row: T) => React.ReactNode;
}

export interface BulkAction<T> {
  label: string;
  destructive?: boolean;
  run: (rows: T[]) => Promise<void> | void;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  getHref,
  loading,
  emptyTitle = 'Nothing here yet',
  emptyBody,
  emptyAction,
  bulkActions,
  total,
  page,
  perPage,
  className,
}: {
  rows: T[];
  columns: Column<T>[];
  getHref?: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: React.ReactNode;
  bulkActions?: BulkAction<T>[];
  total?: number;
  page?: number;
  perPage?: number;
  className?: string;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => setSelected(new Set()), [rows]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const selectedRows = rows.filter((row) => selected.has(row.id));

  const hideClass = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' } as const;

  if (loading) {
    return (
      <div className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <EmptyState
        title={emptyTitle}
        body={emptyBody}
        action={emptyAction}
        className="rounded-lg border border-hairline bg-surface"
      />
    );
  }

  return (
    <div className={cn('rounded-lg border border-hairline bg-surface', className)}>
      {bulkActions && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-hairline bg-accent/5 px-4 py-2.5">
          <span className="text-[13px] text-ink">{selected.size} selected</span>
          {bulkActions.map((action) => (
            <Button
              key={action.label}
              size="sm"
              variant={action.destructive ? 'danger' : 'secondary'}
              loading={running}
              onClick={async () => {
                setRunning(true);
                try {
                  await action.run(selectedRows);
                  setSelected(new Set());
                } finally {
                  setRunning(false);
                }
              }}
            >
              {action.label}
            </Button>
          ))}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-hairline">
              {bulkActions && (
                <th scope="col" className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={allSelected}
                    onChange={(event) =>
                      setSelected(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())
                    }
                    className="h-4 w-4 cursor-pointer accent-[rgb(var(--accent))]"
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    'whitespace-nowrap px-4 py-3 font-medium uppercase tracking-[0.08em] text-2xs text-faint',
                    column.numeric && 'text-right',
                    column.hideBelow && hideClass[column.hideBelow],
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  'border-b border-hairline transition-colors last:border-0',
                  selected.has(row.id) ? 'bg-accent/5' : 'hover:bg-ink/[0.025]',
                )}
              >
                {bulkActions && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select row ${row.id}`}
                      checked={selected.has(row.id)}
                      onChange={(event) => {
                        const next = new Set(selected);
                        if (event.target.checked) next.add(row.id);
                        else next.delete(row.id);
                        setSelected(next);
                      }}
                      className="h-4 w-4 cursor-pointer accent-[rgb(var(--accent))]"
                    />
                  </td>
                )}
                {columns.map((column, index) => {
                  const content = column.render(row);
                  const href = getHref?.(row);
                  return (
                    <td
                      key={column.key}
                      className={cn(
                        'px-4 py-3 align-middle text-ink',
                        column.numeric && 'text-right tabular',
                        column.hideBelow && hideClass[column.hideBelow],
                      )}
                    >
                      {index === 0 && href ? (
                        <Link href={href} className="block hover:text-accent">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {typeof total === 'number' && typeof page === 'number' && typeof perPage === 'number' && (
        <TablePagination total={total} page={page} perPage={perPage} />
      )}
    </div>
  );
}

function TablePagination({ total, page, perPage }: { total: number; page: number; perPage: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  const go = (next: number) => {
    const search = new URLSearchParams(params.toString());
    if (next <= 1) search.delete('page');
    else search.set('page', String(next));
    const query = search.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className="flex items-center justify-between gap-4 border-t border-hairline px-4 py-3">
      <p className="text-xs tabular text-muted">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => go(page - 1)}>
          Previous
        </Button>
        <span className="text-xs tabular text-muted">
          {page} / {pageCount}
        </span>
        <Button size="sm" variant="secondary" disabled={page >= pageCount} onClick={() => go(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/** Search + filter row that writes straight into the URL. */
export function TableToolbar({
  searchPlaceholder = 'Search…',
  filters,
  actions,
}: {
  searchPlaceholder?: string;
  filters?: { name: string; label: string; options: { value: string; label: string }[] }[];
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [term, setTerm] = React.useState(params.get('q') ?? '');

  React.useEffect(() => setTerm(params.get('q') ?? ''), [params]);

  const update = (key: string, value: string | null) => {
    const search = new URLSearchParams(params.toString());
    if (value) search.set(key, value);
    else search.delete(key);
    search.delete('page');
    const query = search.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2.5">
      <form
        className="relative min-w-[200px] flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          update('q', term.trim() || null);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="field h-10 pl-9 text-[13px]"
        />
      </form>

      {filters?.map((filter) => (
        <label key={filter.name} className="flex items-center gap-2">
          <span className="sr-only">{filter.label}</span>
          <Select
            value={params.get(filter.name) ?? ''}
            onChange={(event) => update(filter.name, event.target.value || null)}
            className="h-10 w-[150px] text-[13px]"
          >
            <option value="">{filter.label}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      ))}

      {(params.get('q') || filters?.some((f) => params.get(f.name))) && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => router.push(pathname)}
          className="gap-1.5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}

      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Consistent page header for every admin screen. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-ink lg:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const STATUS_TONES: Record<string, 'neutral' | 'positive' | 'caution' | 'critical' | 'info' | 'accent'> = {
  PENDING: 'caution',
  PROCESSING: 'info',
  CONFIRMED: 'info',
  READY: 'info',
  SHIPPED: 'accent',
  DELIVERED: 'positive',
  CANCELLED: 'neutral',
  REFUNDED: 'neutral',
  SUCCESSFUL: 'positive',
  FAILED: 'critical',
  EXPIRED: 'neutral',
  PARTIALLY_REFUNDED: 'caution',
  IN_STOCK: 'positive',
  LOW_STOCK: 'caution',
  OUT_OF_STOCK: 'critical',
  BACKORDER: 'info',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{label ?? status.replace(/_/g, ' ').toLowerCase()}</Badge>;
}
