import type { PriceSchedule, ProductVariant } from '@/generated/prisma/client';
import { discountPercent } from '../money';

/**
 * Effective pricing.
 *
 * A variant carries a list price. Price schedules layer sale, promotional and
 * future-dated prices on top without ever overwriting the list price, so a
 * promotion can be scheduled, previewed and rolled back. The highest-priority
 * schedule whose window contains `now` wins.
 *
 * This function is the ONLY place a sale price is decided. The storefront, the
 * cart, the checkout total and the admin preview all call it, which is what
 * guarantees the price a customer sees is the price the order is written with.
 */

export interface EffectivePrice {
  /** What the customer pays, in minor units. */
  price: number;
  /** Struck-through reference price, if any. */
  compareAtPrice: number | null;
  currency: string;
  /** 0–100, or null when not discounted. */
  discountPercent: number | null;
  onSale: boolean;
  /** Name of the promotion that produced this price. */
  promotionLabel: string | null;
  scheduleId: string | null;
}

export type VariantForPricing = Pick<
  ProductVariant,
  'id' | 'price' | 'compareAtPrice' | 'currency'
> & { schedules?: PriceSchedule[] };

export function effectivePrice(variant: VariantForPricing, now: Date = new Date()): EffectivePrice {
  const active = (variant.schedules ?? [])
    .filter((s) => s.active && s.startsAt <= now && (!s.endsAt || s.endsAt > now))
    .sort((a, b) => b.priority - a.priority || b.startsAt.getTime() - a.startsAt.getTime());

  const winner = active[0];
  const price = winner ? winner.price : variant.price;
  // A schedule may set its own reference price; otherwise the list price acts
  // as the "was" figure, which is both honest and what shoppers expect.
  const compareAt = winner
    ? (winner.compareAtPrice ?? (variant.price > price ? variant.price : (variant.compareAtPrice ?? null)))
    : (variant.compareAtPrice ?? null);

  const pct = discountPercent(price, compareAt);
  return {
    price,
    compareAtPrice: compareAt && compareAt > price ? compareAt : null,
    currency: variant.currency,
    discountPercent: pct,
    onSale: pct !== null,
    promotionLabel: winner?.label ?? null,
    scheduleId: winner?.id ?? null,
  };
}

/** Cheapest effective price across a product's variants — for catalogue cards. */
export function priceRange(variants: VariantForPricing[], now: Date = new Date()) {
  const priced = variants.map((v) => effectivePrice(v, now));
  if (!priced.length) return null;
  const sorted = [...priced].sort((a, b) => a.price - b.price);
  return {
    from: sorted[0],
    to: sorted[sorted.length - 1],
    hasRange: sorted[0].price !== sorted[sorted.length - 1].price,
    anyOnSale: priced.some((p) => p.onSale),
    maxDiscount: priced.reduce<number | null>(
      (max, p) => (p.discountPercent && (!max || p.discountPercent > max) ? p.discountPercent : max),
      null,
    ),
  };
}

/** Prisma include fragment that loads exactly what pricing needs. */
export const PRICING_INCLUDE = {
  schedules: {
    where: { active: true },
    orderBy: [{ priority: 'desc' as const }, { startsAt: 'desc' as const }],
  },
};
