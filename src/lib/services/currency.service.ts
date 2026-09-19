import { prisma } from '../db';
import { convert, exchangeRateBetween, FALLBACK_CURRENCY, type CurrencyMeta } from '../money';
import { getSettings } from '../settings';

/**
 * Currency service.
 *
 * Rates live in the database and are edited in the admin. Conversion is always
 * performed on the server: the browser receives amounts already denominated in
 * the currency it is asked to display, plus the rate used, so a total can be
 * audited but never recomputed client-side into something we would honour.
 */

let cache: { list: CurrencyMeta[]; at: number } | null = null;
const TTL = 60_000;

export async function listCurrencies(force = false): Promise<CurrencyMeta[]> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.list;
  let list: CurrencyMeta[] = [FALLBACK_CURRENCY];
  try {
    const rows = await prisma.currency.findMany({
      where: { active: true },
      orderBy: [{ isBase: 'desc' }, { position: 'asc' }],
    });
    if (rows.length) {
      list = rows.map((r) => ({
        code: r.code,
        name: r.name,
        symbol: r.symbol,
        precision: r.precision,
        rate: r.rate,
      }));
    }
  } catch {
    // Pre-migration boot.
  }
  cache = { list, at: Date.now() };
  return list;
}

export async function getCurrency(code: string): Promise<CurrencyMeta> {
  const list = await listCurrencies();
  return list.find((c) => c.code === code.toUpperCase()) ?? FALLBACK_CURRENCY;
}

export async function getBaseCurrency(): Promise<CurrencyMeta> {
  const settings = await getSettings();
  return getCurrency(settings.currency.base);
}

export async function getDisplayCurrency(requested?: string | null): Promise<CurrencyMeta> {
  const settings = await getSettings();
  const list = await listCurrencies();
  const wanted = (requested ?? settings.currency.display).toUpperCase();
  if (settings.currency.supported.includes(wanted)) {
    const found = list.find((c) => c.code === wanted);
    if (found) return found;
  }
  return getCurrency(settings.currency.display);
}

/**
 * Converts a base-currency amount for display. Returns both the converted
 * amount and the rate, so the UI can show "≈" and the order can freeze it.
 */
export async function present(
  amountInBase: number,
  displayCode?: string | null,
): Promise<{ amount: number; currency: CurrencyMeta; rate: number }> {
  const base = await getBaseCurrency();
  const display = await getDisplayCurrency(displayCode);
  return {
    amount: convert(amountInBase, base, display),
    currency: display,
    rate: exchangeRateBetween(base, display),
  };
}

/**
 * Works out what a provider should actually be asked to charge. Mobile money
 * settles in a local currency (RWF) while the store may present AED; the rate
 * is returned so it can be frozen on the payment row for reconciliation.
 */
export async function resolveSettlement(
  amount: number,
  orderCurrency: string,
  settlementCurrency: string,
): Promise<{ chargeAmount: number; currency: CurrencyMeta; rate: number }> {
  const from = await getCurrency(orderCurrency);
  const to = await getCurrency(settlementCurrency);
  return {
    chargeAmount: convert(amount, from, to),
    currency: to,
    rate: exchangeRateBetween(from, to),
  };
}

export function invalidateCurrencyCache() {
  cache = null;
}
