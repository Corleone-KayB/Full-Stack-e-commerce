'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductDetailDTO, VariantDTO } from '@/types/catalog';

/**
 * Variant selection.
 *
 * Axes are whatever the data says they are — storage and colour today, RAM and
 * band size the moment a merchant adds them. Combinations that do not exist
 * are disabled rather than hidden, so the shopper can see what the product
 * comes in and what is simply unavailable.
 */

export interface VariantSelection {
  selected: Record<string, string>;
  variant: VariantDTO | null;
  choose: (axisKey: string, valueId: string) => void;
  isAvailable: (axisKey: string, valueId: string) => boolean;
  isSoldOut: (axisKey: string, valueId: string) => boolean;
}

export function useVariantSelection(product: ProductDetailDTO | null): VariantSelection {
  const [selected, setSelected] = React.useState<Record<string, string>>({});

  // Default to the cheapest in-stock variant — the honest opening offer.
  React.useEffect(() => {
    if (!product) return;
    const inStock = product.variants.filter((v) => (v.stock?.available ?? 0) > 0);
    const pool = inStock.length ? inStock : product.variants;
    const initial = [...pool].sort((a, b) => a.displayPrice - b.displayPrice)[0];
    if (!initial) return;
    setSelected(
      Object.fromEntries(Object.entries(initial.attributes).map(([key, value]) => [key, value.id])),
    );
  }, [product]);

  const variant = React.useMemo(() => {
    if (!product) return null;
    const keys = product.axes.map((a) => a.key);
    if (!keys.length) return product.variants[0] ?? null;
    return (
      product.variants.find((candidate) =>
        keys.every((key) => candidate.attributes[key]?.id === selected[key]),
      ) ?? null
    );
  }, [product, selected]);

  const choose = React.useCallback(
    (axisKey: string, valueId: string) => {
      if (!product) return;
      setSelected((current) => {
        const next = { ...current, [axisKey]: valueId };
        // If the new combination does not exist, keep the changed axis and
        // move the others to the nearest combination that does.
        const keys = product.axes.map((a) => a.key);
        const exact = product.variants.find((v) => keys.every((k) => v.attributes[k]?.id === next[k]));
        if (exact) return next;

        const fallback =
          product.variants.find(
            (v) => v.attributes[axisKey]?.id === valueId && (v.stock?.available ?? 0) > 0,
          ) ?? product.variants.find((v) => v.attributes[axisKey]?.id === valueId);

        if (!fallback) return next;
        return Object.fromEntries(Object.entries(fallback.attributes).map(([k, val]) => [k, val.id]));
      });
    },
    [product],
  );

  const matching = React.useCallback(
    (axisKey: string, valueId: string) => {
      if (!product) return [];
      const otherKeys = product.axes.map((a) => a.key).filter((k) => k !== axisKey);
      return product.variants.filter(
        (v) =>
          v.attributes[axisKey]?.id === valueId &&
          otherKeys.every((k) => !selected[k] || v.attributes[k]?.id === selected[k]),
      );
    },
    [product, selected],
  );

  return {
    selected,
    variant,
    choose,
    // Exists at all in this product.
    isAvailable: (axisKey, valueId) =>
      !!product?.variants.some((v) => v.attributes[axisKey]?.id === valueId),
    // Exists but has no stock in the current combination.
    isSoldOut: (axisKey, valueId) => {
      const options = matching(axisKey, valueId);
      if (!options.length) return true;
      return options.every((v) => (v.stock?.available ?? 0) <= 0);
    },
  };
}

export function VariantAxes({
  product,
  selection,
  className,
}: {
  product: ProductDetailDTO;
  selection: VariantSelection;
  className?: string;
}) {
  return (
    <div className={cn('space-y-6', className)}>
      {product.axes.map((axis) => {
        const isColour = axis.key === 'color';
        const chosen = axis.values.find((v) => v.id === selection.selected[axis.key]);

        return (
          <fieldset key={axis.key}>
            <legend className="mb-2.5 flex w-full items-baseline justify-between">
              <span className="eyebrow">{axis.name}</span>
              {chosen && <span className="text-[13px] text-ink">{chosen.label}</span>}
            </legend>

            <div className={cn('flex flex-wrap gap-2', isColour && 'gap-2.5')}>
              {axis.values.map((value) => {
                const active = selection.selected[axis.key] === value.id;
                const soldOut = selection.isSoldOut(axis.key, value.id);

                if (isColour) {
                  return (
                    <button
                      key={value.id}
                      type="button"
                      onClick={() => selection.choose(axis.key, value.id)}
                      aria-pressed={active}
                      aria-label={`${value.label}${soldOut ? ' — sold out' : ''}`}
                      title={value.label}
                      className={cn(
                        'relative flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-200',
                        active ? 'border-accent' : 'border-hairline hover:border-ink/30',
                        soldOut && 'opacity-40',
                      )}
                    >
                      <span
                        className="h-6 w-6 rounded-full border border-black/10"
                        style={{ backgroundColor: value.hex ?? '#888' }}
                      />
                      {active && (
                        <Check
                          className="absolute h-3 w-3 text-white mix-blend-difference"
                          strokeWidth={3}
                          aria-hidden
                        />
                      )}
                      {soldOut && (
                        <span className="absolute h-[2px] w-8 -rotate-45 rounded bg-critical/70" aria-hidden />
                      )}
                    </button>
                  );
                }

                return (
                  <button
                    key={value.id}
                    type="button"
                    onClick={() => selection.choose(axis.key, value.id)}
                    aria-pressed={active}
                    className={cn(
                      'relative min-w-[74px] rounded border px-4 py-2.5 text-[13px] font-medium transition-all duration-200',
                      active
                        ? 'border-accent bg-accent/8 text-ink'
                        : 'border-hairline text-muted hover:border-ink/30 hover:text-ink',
                      soldOut && 'text-faint',
                    )}
                  >
                    {value.label}
                    {soldOut && (
                      <span className="absolute inset-x-2 top-1/2 h-px -rotate-6 bg-faint/60" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

export function StockLine({ variant }: { variant: VariantDTO | null }) {
  if (!variant) {
    return <p className="text-sm text-caution">That combination is not available — choose another.</p>;
  }
  const stock = variant.stock;
  const available = stock?.available ?? 0;

  if (available <= 0 && !stock?.backorderable) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-faint" aria-hidden />
        Sold out — check back soon
      </p>
    );
  }
  if (stock?.status === 'LOW_STOCK') {
    return (
      <p className="flex items-center gap-2 text-sm text-caution">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-caution" aria-hidden />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-caution" />
        </span>
        Only {available} left in this finish
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-positive">
      <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden />
      In stock · ships today
    </p>
  );
}

export function QuantityStepper({
  value,
  onChange,
  max = 20,
  min = 1,
  size = 'md',
}: {
  value: number;
  onChange: (next: number) => void;
  max?: number;
  min?: number;
  size?: 'sm' | 'md';
}) {
  const h = size === 'sm' ? 'h-9' : 'h-11';
  return (
    <div className={cn('inline-flex items-center rounded border border-hairline', h)}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className={cn('flex w-9 items-center justify-center text-ink disabled:opacity-30', h)}
      >
        −
      </button>
      <span className="w-8 text-center text-sm tabular" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Increase quantity"
        className={cn('flex w-9 items-center justify-center text-ink disabled:opacity-30', h)}
      >
        +
      </button>
    </div>
  );
}
