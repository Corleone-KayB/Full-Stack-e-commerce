import { describe, expect, it } from 'vitest';
import {
  applyPercent,
  convert,
  discountPercent,
  exchangeRateBetween,
  formatMoney,
  sumMinor,
  toMajor,
  toMinor,
  type CurrencyMeta,
} from '@/lib/money';

const AED: CurrencyMeta = { code: 'AED', name: 'UAE Dirham', symbol: 'AED', precision: 2, rate: 1 };
const RWF: CurrencyMeta = { code: 'RWF', name: 'Rwandan Franc', symbol: 'RWF', precision: 0, rate: 370 };
const USD: CurrencyMeta = { code: 'USD', name: 'US Dollar', symbol: '$', precision: 2, rate: 0.2723 };

describe('minor units', () => {
  it('round-trips whole and fractional amounts', () => {
    expect(toMinor(1450)).toBe(145_000);
    expect(toMinor(1450.5)).toBe(145_050);
    expect(toMajor(145_050)).toBe(1450.5);
  });

  it('survives the binary-float traps that break naive × 100', () => {
    // 1.005 * 100 === 100.49999999999999 in IEEE 754, and (1.005).toFixed(2)
    // is "1.00" for the same reason — both would round a half down.
    expect(toMinor(1.005)).toBe(101);
    expect(toMinor(2.675)).toBe(268);
    expect(toMinor(0.07 * 3)).toBe(21);
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor(1450.5)).toBe(145_050);
  });

  it('rounds refunds away from zero, never against the customer', () => {
    expect(toMinor(-1.005)).toBe(-101);
    expect(toMinor(-19.99)).toBe(-1999);
    expect(toMinor(-0)).toBe(0);
  });

  it('parses formatted strings a merchant might paste in', () => {
    expect(toMinor('1,450.50')).toBe(145_050);
    expect(toMinor('AED 2,300')).toBe(230_000);
    expect(toMinor('')).toBe(0);
    expect(toMinor('not a number')).toBe(0);
  });

  it('honours zero-decimal currencies', () => {
    expect(toMinor(2500, 0)).toBe(2500);
    expect(toMajor(2500, 0)).toBe(2500);
  });

  it('sums without drift', () => {
    expect(sumMinor([145_050, 230_000, 1999])).toBe(377_049);
    expect(sumMinor([])).toBe(0);
  });
});

describe('conversion', () => {
  it('is a no-op between identical currencies', () => {
    expect(convert(145_050, AED, AED)).toBe(145_050);
    expect(exchangeRateBetween(AED, AED)).toBe(1);
  });

  it('converts into a zero-decimal currency as whole units', () => {
    // 1,450.50 AED at 370 RWF per AED = 536,685 RWF, no fractional franc.
    const rwf = convert(145_050, AED, RWF);
    expect(rwf).toBe(536_685);
    expect(Number.isInteger(rwf)).toBe(true);
  });

  it('converts back within one minor unit of rounding', () => {
    const there = convert(145_050, AED, USD);
    const back = convert(there, USD, AED);
    expect(Math.abs(back - 145_050)).toBeLessThanOrEqual(1);
  });

  it('reports the rate actually applied', () => {
    expect(exchangeRateBetween(AED, RWF)).toBe(370);
    expect(exchangeRateBetween(RWF, AED)).toBeCloseTo(1 / 370, 10);
  });
});

describe('discounts', () => {
  it('computes a percentage only when there is a genuine saving', () => {
    expect(discountPercent(180_000, 230_000)).toBe(22);
    expect(discountPercent(230_000, 230_000)).toBeNull();
    expect(discountPercent(230_000, 180_000)).toBeNull();
    expect(discountPercent(180_000, null)).toBeNull();
  });

  it('floors a percentage discount so the store never over-credits', () => {
    // 15% of 3,333 fils is 499.95 — the customer gets 499, not 500.
    expect(applyPercent(3333, 15)).toBe(499);
    expect(applyPercent(100_000, 10)).toBe(10_000);
    expect(applyPercent(0, 50)).toBe(0);
  });
});

describe('formatting', () => {
  it('renders minor units at the currency precision', () => {
    expect(formatMoney(145_050, AED)).toBe('1,450.50 AED');
    expect(formatMoney(536_685, RWF)).toBe('536,685 RWF');
  });

  it('drops the code when asked', () => {
    expect(formatMoney(145_050, AED, { showCode: false })).toBe('1,450.50');
  });
});
