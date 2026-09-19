'use client';

import * as React from 'react';
import { apiDelete, apiGet, apiPost, errorMessage } from '@/lib/client-api';
import { useToast } from './toast';

/**
 * Wishlist.
 *
 * Persisted server-side against the signed-in user, or against the guest
 * cookie for everyone else — which is what lets a guest's saved items follow
 * them into their account when they sign in (the merge happens on login).
 */

interface WishlistContextValue {
  productIds: Set<string>;
  loading: boolean;
  has: (productId: string) => boolean;
  toggle: (productId: string, name?: string) => Promise<void>;
  count: number;
  refresh: () => Promise<void>;
}

const WishlistContext = React.createContext<WishlistContextValue | null>(null);

export function useWishlist(): WishlistContextValue {
  const ctx = React.useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside <WishlistProvider>.');
  return ctx;
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [productIds, setProductIds] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const toast = useToast();

  const refresh = React.useCallback(async () => {
    try {
      const ids = await apiGet<string[]>('/api/wishlist');
      setProductIds(new Set(ids));
    } catch {
      // Non-critical.
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = React.useCallback<WishlistContextValue['toggle']>(
    async (productId, name) => {
      const saved = productIds.has(productId);
      // Optimistic — the heart must respond on the first tap.
      setProductIds((current) => {
        const next = new Set(current);
        if (saved) next.delete(productId);
        else next.add(productId);
        return next;
      });

      try {
        if (saved) await apiDelete('/api/wishlist', { productId });
        else await apiPost('/api/wishlist', { productId });
        toast.push({
          tone: 'success',
          title: saved ? 'Removed from saved items' : 'Saved',
          body: name,
        });
      } catch (error) {
        setProductIds((current) => {
          const next = new Set(current);
          if (saved) next.add(productId);
          else next.delete(productId);
          return next;
        });
        toast.error("Couldn't update saved items", errorMessage(error));
      }
    },
    [productIds, toast],
  );

  const value = React.useMemo<WishlistContextValue>(
    () => ({
      productIds,
      loading,
      has: (id: string) => productIds.has(id),
      toggle,
      count: productIds.size,
      refresh,
    }),
    [productIds, loading, toggle, refresh],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}
