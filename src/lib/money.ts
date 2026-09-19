/**
 * Money.
 *
 * Every monetary amount in this codebase is an INTEGER number of minor units
 * (fils for AED, centimes for RWF-as-whole-units, cents for USD). Floats are
 * never used for arithmetic, and the browser never computes a total that the
 * server will trust — client-side formatting is presentation only.
 */

export type CurrencyCode = string;

export interface CurrencyMeta {
  code: CurrencyCode;
  name: string;
  symbol: string;
  /** Decimal places. RWF has 0, AED/USD have 2. */
  precision: number;
  /** Units of this currency per 1 unit of the base currency. */
  rate: number;
}

export const FALLBACK_CURRENCY: CurrencyMeta = {
  code: 'AED',
  name: 'UAE Dirham',
  symbol: 'AED',
  precision: 2,
  rate: 1,
};

/** Amount in minor units → major units as a Number (display only). */
export function toMajor(minor: number, precision = 2): number {
  return minor / 10 ** precision;
}

/**
 * Major units (e.g. "1,450.50" or 1450.5) → integer minor units, half-up.
 *
 * Naive `Math.round(n * 100)` rounds 1.005 down, because the nearest double to
 * 1.005 is fractionally below it and 1.005 × 100 evaluates to 100.49999…. So
 * does `Number(n.toFixed(2))`, for the same reason one step earlier. Neither is
 * acceptable for money: an exact half must round up, every time, or a
 * conversion quietly shortchanges someone by a fil.
 *
 * The fix is to nudge the scaled value by a few ULPs before rounding — enough
 * to cancel representation error, far too small to move a figure that was not
 * already sitting on the boundary. Negative amounts (refunds) round away from
 * zero, so a refund is never rounded down against the customer.
 */
export function toMinor(major: number | string, precision = 2): number {
  const n = typeof major === 'string' ? Number(major.replace(/[^0-9.\-]/g, '')) : major;
  if (!Number.isFinite(n)) return 0;
  const scaled = Math.abs(n) * 10 ** precision;
  const corrected = scaled + scaled * Number.EPSILON * 4;
  // `|| 0` normalises -0, which is a valid double but a strange thing to write
  // into a money column or render on an invoice.
  return Math.sign(n) * Math.round(corrected) || 0;
}

export function formatMoney(
  minor: number,
  currency: CurrencyMeta | CurrencyCode = FALLBACK_CURRENCY,
  options: { showCode?: boolean; compact?: boolean } = {},
): string {
  const meta = typeof currency === 'string' ? { ...FALLBACK_CURRENCY, code: currency, symbol: currency } : currency;
  const value = toMajor(minor, meta.precision);
  const formatter = new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: options.compact && Number.isInteger(value) ? 0 : meta.precision,
    maximumFractionDigits: meta.precision,
    notation: 'standard',
  });
  const body = formatter.format(value);
  return options.showCode === false ? body : `${body} ${meta.symbol}`;
}

/** Compact form for dashboards: 1.2M AED */
export function formatMoneyCompact(minor: number, meta: CurrencyMeta = FALLBACK_CURRENCY): string {
  const value = toMajor(minor, meta.precision);
  const formatted = new Intl.NumberFormat('en-AE', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
  return `${formatted} ${meta.symbol}`;
}

/**
 * Convert between currencies using stored rates, both expressed relative to
 * the base currency. Rounds half-up at the target precision — the result is
 * what the customer is actually charged, so it must be deterministic.
 */
export function convert(minor: number, from: CurrencyMeta, to: CurrencyMeta): number {
  if (from.code === to.code) return minor;
  const inBase = toMajor(minor, from.precision) / (from.rate || 1);
  const inTarget = inBase * (to.rate || 1);
  return toMinor(inTarget, to.precision);
}

export function exchangeRateBetween(from: CurrencyMeta, to: CurrencyMeta): number {
  if (from.code === to.code) return 1;
  return (to.rate || 1) / (from.rate || 1);
}

export function discountPercent(price: number, compareAt?: number | null): number | null {
  if (!compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

/** Percentage discount on a minor-unit amount, floored so we never over-credit. */
export function applyPercent(minor: number, percent: number): number {
  return Math.floor((minor * percent) / 100);
}

export function sumMinor(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
