import { prisma } from './db';
import { decodeJson, encodeJson } from './json';

/**
 * Store settings.
 *
 * Everything a merchant can change without a developer lives here: brand,
 * copy, trust statements, delivery defaults, currency, SEO, payment toggles.
 * Reads are cached per request-ish (60s process cache) because they are hit on
 * every page render; writes bust the cache immediately.
 */

export interface StoreSettings {
  store: {
    name: string;
    tagline: string;
    legalName: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    email: string;
    phone: string;
    whatsapp: string | null;
    addressLine: string;
    city: string;
    country: string;
    socials: { label: string; href: string }[];
  };
  currency: {
    base: string;
    display: string;
    supported: string[];
    /** Currency actually used to settle mobile-money charges. */
    mobileMoneySettlement: string;
  };
  homepage: {
    heroEyebrow: string;
    heroHeadline: string;
    heroSubhead: string;
    heroPrimaryCta: { label: string; href: string };
    heroSecondaryCta: { label: string; href: string };
    heroImageUrl: string | null;
    featuredHeading: string;
    featuredSubheading: string;
  };
  trust: {
    /** Editable claims. Nothing is asserted that the merchant has not set. */
    statements: { title: string; body: string; icon: string }[];
    showPaymentBadges: boolean;
  };
  delivery: {
    defaultZoneId: string | null;
    freeDeliveryThreshold: number | null;
    estimateCopy: string;
    pickupEnabled: boolean;
    pickupAddress: string | null;
  };
  payments: {
    enabled: string[];
    environment: 'sandbox' | 'live';
    /** Rendered on checkout under the provider list. */
    securityCopy: string;
  };
  seo: {
    siteTitle: string;
    titleTemplate: string;
    defaultDescription: string;
    ogImageUrl: string | null;
    twitterHandle: string | null;
  };
  appearance: {
    accent: string;
    defaultTheme: 'dark' | 'light';
    announcementBar: { enabled: boolean; text: string; href: string | null };
  };
  notifications: {
    orderConfirmationEmail: boolean;
    paymentReceiptEmail: boolean;
    statusChangeEmail: boolean;
    adminOrderAlertTo: string | null;
  };
}

export const DEFAULT_SETTINGS: StoreSettings = {
  store: {
    name: 'AURUM',
    tagline: 'Your next iPhone, beautifully delivered.',
    legalName: 'Aurum Devices Trading LLC',
    logoUrl: null,
    faviconUrl: null,
    email: 'care@aurum.store',
    phone: '+971 4 000 0000',
    whatsapp: null,
    addressLine: 'Gold & Diamond Park, Building 4',
    city: 'Dubai',
    country: 'United Arab Emirates',
    socials: [
      { label: 'Instagram', href: 'https://instagram.com' },
      { label: 'X', href: 'https://x.com' },
      { label: 'LinkedIn', href: 'https://linkedin.com' },
    ],
  },
  currency: {
    base: 'AED',
    display: 'AED',
    supported: ['AED', 'USD', 'RWF'],
    mobileMoneySettlement: 'RWF',
  },
  homepage: {
    heroEyebrow: 'The 2026 collection',
    heroHeadline: 'Your next iPhone,\nbeautifully delivered.',
    heroSubhead:
      'Hand-checked devices, transparent pricing and next-day delivery across the Emirates. Pay by card or mobile money.',
    heroPrimaryCta: { label: 'Shop iPhone', href: '/shop' },
    heroSecondaryCta: { label: 'Explore models', href: '/shop?view=series' },
    heroImageUrl: null,
    featuredHeading: 'Chosen for you',
    featuredSubheading: 'The models our customers reach for most.',
  },
  trust: {
    statements: [
      {
        title: 'Every device inspected',
        body: 'A 42-point functional and cosmetic check before anything is boxed.',
        icon: 'shield',
      },
      {
        title: '12-month warranty',
        body: 'Covered for hardware faults, with local service and a simple claim.',
        icon: 'certificate',
      },
      {
        title: 'Next-day delivery',
        body: 'Ordered before 4pm on a working day, delivered across the UAE tomorrow.',
        icon: 'truck',
      },
      {
        title: 'Secure payment',
        body: 'Card details are handled by our processor. We never see or store them.',
        icon: 'lock',
      },
    ],
    showPaymentBadges: true,
  },
  delivery: {
    defaultZoneId: null,
    freeDeliveryThreshold: 150000,
    estimateCopy: 'Delivered in 1–3 working days.',
    pickupEnabled: true,
    pickupAddress: 'Gold & Diamond Park, Building 4, Unit 12 — Dubai',
  },
  payments: {
    enabled: ['card', 'mtn_momo', 'airtel_money'],
    environment: 'sandbox',
    securityCopy:
      'Payments are processed on our servers over TLS. Card numbers and mobile-money PINs never reach this website.',
  },
  seo: {
    siteTitle: 'AURUM — Premium iPhones, beautifully delivered',
    titleTemplate: '%s · AURUM',
    defaultDescription:
      'Hand-checked iPhones with transparent pricing, a 12-month warranty and next-day delivery across the UAE.',
    ogImageUrl: null,
    twitterHandle: null,
  },
  appearance: {
    accent: '#C8A96A',
    defaultTheme: 'dark',
    announcementBar: {
      enabled: true,
      text: 'Complimentary next-day delivery on orders over 1,500 AED',
      href: '/pages/delivery',
    },
  },
  notifications: {
    orderConfirmationEmail: true,
    paymentReceiptEmail: true,
    statusChangeEmail: true,
    adminOrderAlertTo: null,
  },
};

export type SettingGroup = keyof StoreSettings;

let cache: { value: StoreSettings; at: number } | null = null;
const TTL_MS = 60_000;

function deepMerge<T>(base: T, override: unknown): T {
  if (override === null || override === undefined) return base;
  if (Array.isArray(base) || typeof base !== 'object') return override as T;
  if (typeof override !== 'object') return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    out[k] = k in out ? deepMerge((base as Record<string, unknown>)[k], v) : v;
  }
  return out as T;
}

export async function getSettings(force = false): Promise<StoreSettings> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value = DEFAULT_SETTINGS;
  try {
    const rows = await prisma.setting.findMany();
    const overrides: Record<string, unknown> = {};
    for (const row of rows) overrides[row.key] = decodeJson<unknown>(row.value, null);
    value = deepMerge(DEFAULT_SETTINGS, overrides);
  } catch {
    // Database not migrated yet (first boot) — defaults keep the app renderable.
  }
  cache = { value, at: Date.now() };
  return value;
}

export async function getSettingGroup<K extends SettingGroup>(group: K): Promise<StoreSettings[K]> {
  return (await getSettings())[group];
}

export async function updateSettingGroup<K extends SettingGroup>(
  group: K,
  patch: Partial<StoreSettings[K]>,
): Promise<StoreSettings[K]> {
  const current = await getSettings(true);
  const next = deepMerge(current[group], patch);
  await prisma.setting.upsert({
    where: { key: group as string },
    create: { key: group as string, group: group as string, value: encodeJson(next) },
    update: { value: encodeJson(next) },
  });
  cache = null;
  return next as StoreSettings[K];
}

export function invalidateSettingsCache() {
  cache = null;
}
