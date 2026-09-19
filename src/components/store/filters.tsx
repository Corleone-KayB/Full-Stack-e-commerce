'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/components/providers';
import { Badge, Button, Checkbox, Drawer, Select } from '@/components/ui';
import { SORT_LABELS, PRODUCT_SORTS, type ProductSort } from '@/types/enums';
import type { CatalogFacets } from '@/types/catalog';

/**
 * Catalogue filters.
 *
 * State lives entirely in the URL, so every filtered view is a shareable,
 * bookmarkable, indexable address — /shop?series=iphone-15&storage=256gb —
 * and the back button behaves the way people expect.
 */

function useFilterState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const values = React.useCallback(
    (key: string) => searchParams.get(key)?.split(',').filter(Boolean) ?? [],
    [searchParams],
  );

  const apply = React.useCallback(
    (mutate: (params: URLSearchParams) => void, options: { resetPage?: boolean } = {}) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      if (options.resetPage !== false) params.delete('page');
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const toggle = React.useCallback(
    (key: string, value: string) => {
      apply((params) => {
        const current = params.get(key)?.split(',').filter(Boolean) ?? [];
        const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
        if (next.length) params.set(key, next.join(','));
        else params.delete(key);
      });
    },
    [apply],
  );

  const setValue = React.useCallback(
    (key: string, value: string | null) => {
      apply((params) => {
        if (value) params.set(key, value);
        else params.delete(key);
      });
    },
    [apply],
  );

  const clearAll = React.useCallback(() => {
    apply((params) => {
      const q = params.get('q');
      const sort = params.get('sort');
      for (const key of [...params.keys()]) params.delete(key);
      if (q) params.set('q', q);
      if (sort) params.set('sort', sort);
    });
  }, [apply]);

  return { values, toggle, setValue, clearAll, searchParams };
}

interface FilterPanelProps {
  facets: CatalogFacets;
  onNavigate?: () => void;
}

function FilterGroup({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="border-b border-hairline py-5 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-3 flex w-full items-center justify-between"
      >
        <span className="eyebrow">{title}</span>
        <span className="text-faint" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && <div className="space-y-2.5">{children}</div>}
    </div>
  );
}

export function FilterPanel({ facets, onNavigate }: FilterPanelProps) {
  const { values, toggle, setValue, searchParams } = useFilterState();
  const { format, currency } = useCurrency();

  const [minPrice, setMinPrice] = React.useState(searchParams.get('minPrice') ?? '');
  const [maxPrice, setMaxPrice] = React.useState(searchParams.get('maxPrice') ?? '');

  React.useEffect(() => {
    setMinPrice(searchParams.get('minPrice') ?? '');
    setMaxPrice(searchParams.get('maxPrice') ?? '');
  }, [searchParams]);

  function applyPrice(event: React.FormEvent) {
    event.preventDefault();
    // Prices in the URL are minor units of the base currency, which is what
    // the API filters on — the inputs are major units of the display currency.
    const toParam = (value: string) => {
      const parsed = Number(value.replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(parsed) || parsed <= 0) return null;
      return String(Math.round((parsed / (currency.rate || 1)) * 100));
    };
    setValue('minPrice', toParam(minPrice));
    setValue('maxPrice', toParam(maxPrice));
    onNavigate?.();
  }

  return (
    <div className="text-sm">
      <FilterGroup title="Availability">
        <Checkbox
          label="In stock only"
          checked={searchParams.get('availability') === 'in-stock'}
          onChange={(event) => {
            setValue('availability', event.target.checked ? 'in-stock' : null);
            onNavigate?.();
          }}
        />
      </FilterGroup>

      {facets.series.length > 0 && (
        <FilterGroup title="Series">
          {facets.series.map((option) => (
            <Checkbox
              key={option.value}
              label={
                <span className="flex w-full items-center justify-between gap-3">
                  <span>{option.label}</span>
                  <span className="text-2xs tabular text-faint">{option.count}</span>
                </span>
              }
              checked={values('series').includes(option.value)}
              onChange={() => {
                toggle('series', option.value);
                onNavigate?.();
              }}
            />
          ))}
        </FilterGroup>
      )}

      {facets.attributes.map((axis) => (
        <FilterGroup key={axis.key} title={axis.name}>
          {axis.options.map((option) => (
            <Checkbox
              key={option.value}
              label={
                <span className="flex w-full items-center justify-between gap-3">
                  <span>{option.label}</span>
                  <span className="text-2xs tabular text-faint">{option.count}</span>
                </span>
              }
              checked={values(axis.key).includes(option.value)}
              onChange={() => {
                toggle(axis.key, option.value);
                onNavigate?.();
              }}
            />
          ))}
        </FilterGroup>
      ))}

      <FilterGroup title="Price">
        <form onSubmit={applyPrice} className="space-y-2.5">
          <div className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              placeholder={format(facets.price.min, { showCode: false, compact: true })}
              aria-label="Minimum price"
              className="field h-9 flex-1 text-xs"
            />
            <span className="text-faint">–</span>
            <input
              inputMode="decimal"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              placeholder={format(facets.price.max, { showCode: false, compact: true })}
              aria-label="Maximum price"
              className="field h-9 flex-1 text-xs"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm" className="w-full">
            Apply price
          </Button>
        </form>
      </FilterGroup>

      {facets.conditions.length > 1 && (
        <FilterGroup title="Condition" defaultOpen={false}>
          {facets.conditions.map((option) => (
            <Checkbox
              key={option.value}
              label={
                <span className="flex w-full items-center justify-between gap-3">
                  <span>{option.label}</span>
                  <span className="text-2xs tabular text-faint">{option.count}</span>
                </span>
              }
              checked={values('condition').includes(option.value)}
              onChange={() => {
                toggle('condition', option.value);
                onNavigate?.();
              }}
            />
          ))}
        </FilterGroup>
      )}

      {facets.brands.length > 1 && (
        <FilterGroup title="Brand" defaultOpen={false}>
          {facets.brands.map((option) => (
            <Checkbox
              key={option.value}
              label={option.label}
              checked={values('brand').includes(option.value)}
              onChange={() => {
                toggle('brand', option.value);
                onNavigate?.();
              }}
            />
          ))}
        </FilterGroup>
      )}
    </div>
  );
}

export function ActiveFilters({ facets, total }: { facets: CatalogFacets; total: number }) {
  const { searchParams, toggle, setValue, clearAll } = useFilterState();

  const labelFor = (key: string, value: string) => {
    if (key === 'series') return facets.series.find((s) => s.value === value)?.label ?? value;
    if (key === 'brand') return facets.brands.find((b) => b.value === value)?.label ?? value;
    if (key === 'condition') return facets.conditions.find((c) => c.value === value)?.label ?? value;
    const axis = facets.attributes.find((a) => a.key === key);
    return axis?.options.find((o) => o.value === value)?.label ?? value;
  };

  const chips: { key: string; value: string; label: string }[] = [];
  for (const key of ['series', 'brand', 'condition', ...facets.attributes.map((a) => a.key)]) {
    for (const value of searchParams.get(key)?.split(',').filter(Boolean) ?? []) {
      chips.push({ key, value, label: labelFor(key, value) });
    }
  }
  if (searchParams.get('availability') === 'in-stock') {
    chips.push({ key: 'availability', value: 'in-stock', label: 'In stock' });
  }
  if (searchParams.get('minPrice') || searchParams.get('maxPrice')) {
    chips.push({ key: '__price', value: '', label: 'Price range' });
  }

  if (!chips.length) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">
        {total} {total === 1 ? 'result' : 'results'}
      </span>
      {chips.map((chip) => (
        <button
          key={`${chip.key}-${chip.value}`}
          type="button"
          onClick={() => {
            if (chip.key === '__price') {
              setValue('minPrice', null);
              setValue('maxPrice', null);
            } else if (chip.key === 'availability') {
              setValue('availability', null);
            } else {
              toggle(chip.key, chip.value);
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-xs border border-hairline px-2.5 py-1
                     text-xs text-muted transition-colors hover:border-ink/30 hover:text-ink"
        >
          {chip.label}
          <X className="h-3 w-3" aria-hidden />
        </button>
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="text-xs text-accent underline underline-offset-4 hover:opacity-80"
      >
        Clear all
      </button>
    </div>
  );
}

export function SortSelect() {
  const { searchParams, setValue } = useFilterState();
  const current = (searchParams.get('sort') ?? 'relevance') as ProductSort;

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Sort products</span>
      <Select
        value={current}
        onChange={(event) => setValue('sort', event.target.value)}
        className="h-10 w-[190px] text-[13px]"
      >
        {PRODUCT_SORTS.map((option) => (
          <option key={option} value={option}>
            {SORT_LABELS[option]}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function MobileFilterButton({ facets, appliedCount }: { facets: CatalogFacets; appliedCount: number }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button variant="secondary" size="md" className="lg:hidden" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {appliedCount > 0 && <Badge tone="accent">{appliedCount}</Badge>}
      </Button>

      <Drawer open={open} onClose={() => setOpen(false)} title="Filters" side="bottom">
        <div className="px-5 py-4">
          <FilterPanel facets={facets} />
        </div>
        <div className="sticky bottom-0 border-t border-hairline bg-canvas px-5 py-4">
          <Button className="w-full" size="lg" onClick={() => setOpen(false)}>
            Show results
          </Button>
        </div>
      </Drawer>
    </>
  );
}

export function Pagination({
  page,
  pageCount,
  className,
}: {
  page: number;
  pageCount: number;
  className?: string;
}) {
  const { setValue } = useFilterState();
  if (pageCount <= 1) return null;

  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const visible = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);

  return (
    <nav className={cn('flex items-center justify-center gap-1.5', className)} aria-label="Pagination">
      <Button
        variant="secondary"
        size="sm"
        disabled={page <= 1}
        onClick={() => setValue('page', String(page - 1))}
      >
        Previous
      </Button>
      {visible.map((value, index) => (
        <React.Fragment key={value}>
          {index > 0 && visible[index - 1] !== value - 1 && <span className="px-1 text-faint">…</span>}
          <button
            type="button"
            onClick={() => setValue('page', value === 1 ? null : String(value))}
            aria-current={value === page ? 'page' : undefined}
            className={cn(
              'h-9 min-w-9 rounded px-2 text-[13px] tabular transition-colors',
              value === page ? 'bg-ink text-canvas' : 'text-muted hover:bg-ink/5 hover:text-ink',
            )}
          >
            {value}
          </button>
        </React.Fragment>
      ))}
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= pageCount}
        onClick={() => setValue('page', String(page + 1))}
      >
        Next
      </Button>
    </nav>
  );
}
