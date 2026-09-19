'use client';

import * as React from 'react';
import { ThemeProvider } from 'next-themes';
import type { CurrencyMeta } from '@/lib/money';
import type { CartDTO } from '@/lib/services/cart.service';
import { ToastProvider } from './toast';
import { CartProvider } from './cart';
import { WishlistProvider } from './wishlist';
import { CurrencyProvider } from './currency';

export function Providers({
  children,
  currency,
  supportedCurrencies,
  initialCart,
  defaultTheme = 'dark',
}: {
  children: React.ReactNode;
  currency: CurrencyMeta;
  supportedCurrencies: CurrencyMeta[];
  initialCart?: CartDTO | null;
  defaultTheme?: 'dark' | 'light';
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme={defaultTheme} enableSystem disableTransitionOnChange>
      <ToastProvider>
        <CurrencyProvider currency={currency} supported={supportedCurrencies}>
          <WishlistProvider>
            <CartProvider initialCart={initialCart}>{children}</CartProvider>
          </WishlistProvider>
        </CurrencyProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export { useToast } from './toast';
export { useCart } from './cart';
export { useWishlist } from './wishlist';
export { useCurrency, Price } from './currency';
