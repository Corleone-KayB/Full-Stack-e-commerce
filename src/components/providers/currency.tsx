'use client';

import * as React from 'react';
import { formatMoney, formatMoneyCompact, type CurrencyMeta } from '@/lib/money';

/**
 * Display currency.
 *
 * The server has already converted every amount it sends into this currency;
 * this context exists only so components can format consistently (symbol,
 * decimal places) and so the switcher knows what to offer. Changing currency
 * reloads server data — the browser never re-converts a price itself.
 */

interface CurrencyContextValue {
  currency: CurrencyMeta;
  supported: CurrencyMeta[];
  setCurrency: (code: string) => void;
  format: (minor: number, options?: { showCode?: boolean; compact?: boolean }) => string;
  formatCompact: (minor: number) => string;
}

const CurrencyContext = React.createContext<CurrencyContextValue | null>(null);

export function useCurrency(): CurrencyContextValue {
  const ctx = React.useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used inside <CurrencyProvider>.');
  return ctx;
}

/** Formats money without needing the provider — for server components. */
export { formatMoney };

export function CurrencyProvider({
  children,
  currency,
  supported,
}: {
  children: React.ReactNode;
  currency: CurrencyMeta;
  supported: CurrencyMeta[];
}) {
  const setCurrency = React.useCallback((code: string) => {
    // A year is fine: it is a display preference, not personal data.
    document.cookie = `aurum_currency=${encodeURIComponent(code)}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }, []);

  const value = React.useMemo<CurrencyContextValue>(
    () => ({
      currency,
      supported,
      setCurrency,
      format: (minor, options) => formatMoney(minor, currency, options),
      formatCompact: (minor) => formatMoneyCompact(minor, currency),
    }),
    [currency, supported, setCurrency],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/** Renders a price with an optional struck-through reference price. */
export function Price({
  amount,
  compareAt,
  className,
  size = 'md',
}: {
  amount: number;
  compareAt?: number | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { format } = useCurrency();
  const sizes = {
    sm: 'text-sm',
    md: 'text-[15px]',
    lg: 'text-2xl',
  } as const;

  return (
    <span className={`inline-flex items-baseline gap-2 tabular ${className ?? ''}`}>
      <span className={`font-medium tracking-tight text-ink ${sizes[size]}`}>{format(amount)}</span>
      {compareAt && compareAt > amount ? (
        <span className="text-xs text-faint line-through" aria-label={`Was ${format(compareAt)}`}>
          {format(compareAt, { showCode: false })}
        </span>
      ) : null}
    </span>
  );
}
