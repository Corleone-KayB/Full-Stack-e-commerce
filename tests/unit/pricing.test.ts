import { describe, expect, it } from 'vitest';
import { effectivePrice, priceRange, type VariantForPricing } from '@/lib/services/pricing.service';
import type { PriceSchedule } from '@/generated/prisma/client';

/**
 * `effectivePrice` is the single place a sale price is decided. If it is wrong,
 * the storefront, the cart and the order are all wrong together — which is why
 * every window, priority and edge case is pinned here.
 */

const NOW = new Date('2026-06-15T12:00:00.000Z');

function schedule(over: Partial<PriceSchedule> & { price: number }): PriceSchedule {
  return {
    id: over.id ?? `sch_${Math.random().toString(36).slice(2)}`,
    variantId: 'var_1',
    label: 'Promotion',
    compareAtPrice: null,
    priority: 0,
    active: true,
    startsAt: new Date('2026-01-01T00:00:00.000Z'),
    endsAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as PriceSchedule;
}

function variant(over: Partial<VariantForPricing> = {}): VariantForPricing {
  return {
    id: 'var_1',
    price: 230_000,
    compareAtPrice: null,
    currency: 'AED',
    schedules: [],
    ...over,
  };
}

describe('effectivePrice', () => {
  it('falls back to the list price when nothing is scheduled', () => {
    const result = effectivePrice(variant(), NOW);
    expect(result.price).toBe(230_000);
    expect(result.onSale).toBe(false);
    expect(result.promotionLabel).toBeNull();
    expect(result.scheduleId).toBeNull();
  });

  it('applies an active schedule and struck-through the list price', () => {
    const result = effectivePrice(
      variant({ schedules: [schedule({ price: 180_000, label: 'Summer' })] }),
      NOW,
    );
    expect(result.price).toBe(180_000);
    expect(result.compareAtPrice).toBe(230_000);
    expect(result.discountPercent).toBe(22);
    expect(result.onSale).toBe(true);
    expect(result.promotionLabel).toBe('Summer');
  });

  it('ignores a schedule that has not started', () => {
    const future = schedule({ price: 100_000, startsAt: new Date('2026-12-01T00:00:00.000Z') });
    expect(effectivePrice(variant({ schedules: [future] }), NOW).price).toBe(230_000);
  });

  it('ignores a schedule that has ended', () => {
    const past = schedule({ price: 100_000, endsAt: new Date('2026-02-01T00:00:00.000Z') });
    expect(effectivePrice(variant({ schedules: [past] }), NOW).price).toBe(230_000);
  });

  it('ignores an inactive schedule even inside its window', () => {
    const paused = schedule({ price: 100_000, active: false });
    expect(effectivePrice(variant({ schedules: [paused] }), NOW).price).toBe(230_000);
  });

  it('lets the highest priority win, not the cheapest', () => {
    const result = effectivePrice(
      variant({
        schedules: [
          schedule({ id: 'a', price: 150_000, priority: 1, label: 'Clearance' }),
          schedule({ id: 'b', price: 190_000, priority: 9, label: 'Members' }),
        ],
      }),
      NOW,
    );
    expect(result.price).toBe(190_000);
    expect(result.promotionLabel).toBe('Members');
    expect(result.scheduleId).toBe('b');
  });

  it('breaks a priority tie with the most recently started schedule', () => {
    const result = effectivePrice(
      variant({
        schedules: [
          schedule({ id: 'old', price: 150_000, startsAt: new Date('2026-01-01T00:00:00.000Z') }),
          schedule({ id: 'new', price: 160_000, startsAt: new Date('2026-06-01T00:00:00.000Z') }),
        ],
      }),
      NOW,
    );
    expect(result.scheduleId).toBe('new');
    expect(result.price).toBe(160_000);
  });

  it('never shows a compare-at below the price being charged', () => {
    // A schedule that raises the price must not render as a "discount".
    const result = effectivePrice(
      variant({ price: 100_000, compareAtPrice: 90_000, schedules: [] }),
      NOW,
    );
    expect(result.compareAtPrice).toBeNull();
    expect(result.onSale).toBe(false);
  });

  it('prefers a schedule-supplied reference price over the list price', () => {
    const result = effectivePrice(
      variant({ schedules: [schedule({ price: 180_000, compareAtPrice: 260_000 })] }),
      NOW,
    );
    expect(result.compareAtPrice).toBe(260_000);
    expect(result.discountPercent).toBe(31);
  });

  it('treats the boundary instants correctly', () => {
    const startsNow = schedule({ price: 111_000, startsAt: NOW });
    expect(effectivePrice(variant({ schedules: [startsNow] }), NOW).price).toBe(111_000);
    const endsNow = schedule({ price: 111_000, endsAt: NOW });
    expect(effectivePrice(variant({ schedules: [endsNow] }), NOW).price).toBe(230_000);
  });
});

describe('priceRange', () => {
  it('returns null for a product with no variants', () => {
    expect(priceRange([], NOW)).toBeNull();
  });

  it('spans cheapest to dearest and flags a range', () => {
    const range = priceRange(
      [variant({ id: 'a', price: 230_000 }), variant({ id: 'b', price: 310_000 })],
      NOW,
    )!;
    expect(range.from.price).toBe(230_000);
    expect(range.to.price).toBe(310_000);
    expect(range.hasRange).toBe(true);
  });

  it('reports no range when every variant costs the same', () => {
    const range = priceRange([variant({ id: 'a' }), variant({ id: 'b' })], NOW)!;
    expect(range.hasRange).toBe(false);
  });

  it('surfaces the deepest discount across variants', () => {
    const range = priceRange(
      [
        variant({ id: 'a', schedules: [schedule({ price: 207_000 })] }), // 10%
        variant({ id: 'b', schedules: [schedule({ price: 115_000 })] }), // 50%
      ],
      NOW,
    )!;
    expect(range.anyOnSale).toBe(true);
    expect(range.maxDiscount).toBe(50);
  });
});
