import 'server-only';
import { cookies } from 'next/headers';
import { getSessionUser, getOrCreateGuestToken, type SessionUser } from './auth';
import { getSettings, type StoreSettings } from './settings';
import { getDisplayCurrency, listCurrencies } from './services/currency.service';
import { emptyCart, findCart, priceCart, type CartDTO } from './services/cart.service';
import type { CurrencyMeta } from './money';
import { prisma } from './db';

/**
 * Per-request storefront context.
 *
 * One place that assembles the things nearly every page needs — settings, the
 * signed-in user, the display currency, the navigation taxonomy — so pages do
 * not each run their own five queries.
 */

export const CURRENCY_COOKIE = 'aurum_currency';

export interface NavCategory {
  name: string;
  slug: string;
  productCount: number;
}

export interface NavSeries {
  name: string;
  slug: string;
  year: number | null;
  productCount: number;
  categorySlug: string;
}

export interface StorefrontContext {
  settings: StoreSettings;
  user: SessionUser | null;
  currency: CurrencyMeta;
  currencies: CurrencyMeta[];
  categories: NavCategory[];
  series: NavSeries[];
}

export async function getRequestedCurrency(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(CURRENCY_COOKIE)?.value ?? null;
}

export async function getStorefrontContext(): Promise<StorefrontContext> {
  const requested = await getRequestedCurrency();
  const [settings, user, currency, currencies, categoryRows, seriesRows] = await Promise.all([
    getSettings(),
    getSessionUser(),
    getDisplayCurrency(requested),
    listCurrencies(),
    prisma.category
      .findMany({
        where: { active: true, showInNav: true },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: { name: true, slug: true, _count: { select: { products: { where: { active: true } } } } },
      })
      .catch(() => []),
    prisma.series
      .findMany({
        where: { active: true },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: {
          name: true,
          slug: true,
          year: true,
          category: { select: { slug: true } },
          _count: { select: { products: { where: { active: true } } } },
        },
      })
      .catch(() => []),
  ]);

  return {
    settings,
    user,
    currency,
    currencies: currencies.filter((c) => settings.currency.supported.includes(c.code)),
    categories: categoryRows.map((c) => ({ name: c.name, slug: c.slug, productCount: c._count.products })),
    series: seriesRows.map((s) => ({
      name: s.name,
      slug: s.slug,
      year: s.year,
      productCount: s._count.products,
      categorySlug: s.category.slug,
    })),
  };
}

/** The current cart, priced in the display currency. Never throws. */
export async function getCurrentCart(): Promise<CartDTO | null> {
  try {
    const [token, currency] = await Promise.all([getOrCreateGuestToken(), getRequestedCurrency()]);
    const cart = await findCart(token);
    // Browsing must not write to the database: the cart row is created on the
    // first add-to-bag, not on the first page view.
    return cart ? priceCart(cart, { displayCurrency: currency }) : emptyCart(token, currency);
  } catch {
    return null;
  }
}
