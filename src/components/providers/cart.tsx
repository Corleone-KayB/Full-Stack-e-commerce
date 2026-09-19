'use client';

import * as React from 'react';
import { apiGet, apiPatch, apiPost, ApiError, errorMessage } from '@/lib/client-api';
import type { CartDTO } from '@/lib/services/cart.service';
import { useToast } from './toast';

/**
 * Cart state.
 *
 * The server owns the cart: this is a cache of it plus optimistic quantity
 * changes. Every mutation returns the recalculated cart, so the totals shown
 * are always the ones the server just computed — the browser never adds up a
 * price itself.
 */

interface CartContextValue {
  cart: CartDTO | null;
  loading: boolean;
  pending: boolean;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  refresh: () => Promise<void>;
  add: (variantId: string, quantity?: number, meta?: { name?: string }) => Promise<boolean>;
  setQuantity: (lineId: string, quantity: number) => Promise<void>;
  remove: (lineId: string) => Promise<void>;
  applyCoupon: (code: string | null) => Promise<boolean>;
  itemCount: number;
}

const CartContext = React.createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>.');
  return ctx;
}

export function CartProvider({ children, initialCart }: { children: React.ReactNode; initialCart?: CartDTO | null }) {
  const [cart, setCart] = React.useState<CartDTO | null>(initialCart ?? null);
  const [loading, setLoading] = React.useState(!initialCart);
  const [pending, setPending] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const toast = useToast();

  const refresh = React.useCallback(async () => {
    try {
      const next = await apiGet<CartDTO>('/api/cart');
      setCart(next);
    } catch {
      // A failed refresh must not blank the bag the customer can see.
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!initialCart) void refresh();
    else setLoading(false);
  }, [initialCart, refresh]);

  const add = React.useCallback<CartContextValue['add']>(
    async (variantId, quantity = 1, meta) => {
      setPending(true);
      try {
        const next = await apiPost<CartDTO>('/api/cart/items', { variantId, quantity });
        setCart(next);
        setDrawerOpen(true);
        toast.success('Added to your bag', meta?.name);
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.code === 'OUT_OF_STOCK') {
          toast.error('Out of stock', error.message);
        } else {
          toast.error("Couldn't add that", errorMessage(error));
        }
        return false;
      } finally {
        setPending(false);
      }
    },
    [toast],
  );

  const setQuantity = React.useCallback<CartContextValue['setQuantity']>(
    async (lineId, quantity) => {
      // Optimistic: the quantity stepper should feel instant.
      const snapshot = cart;
      if (cart) {
        setCart({
          ...cart,
          lines: cart.lines.map((line) => (line.id === lineId ? { ...line, quantity } : line)),
        });
      }
      setPending(true);
      try {
        const next = await apiPatch<CartDTO>('/api/cart/items', { lineId, quantity });
        setCart(next);
      } catch (error) {
        if (snapshot) setCart(snapshot);
        toast.error("Couldn't update your bag", errorMessage(error));
      } finally {
        setPending(false);
      }
    },
    [cart, toast],
  );

  const remove = React.useCallback<CartContextValue['remove']>(
    async (lineId) => {
      setPending(true);
      try {
        const next = await apiPatch<CartDTO>('/api/cart/items', { lineId, quantity: 0 });
        setCart(next);
      } catch (error) {
        toast.error("Couldn't remove that", errorMessage(error));
      } finally {
        setPending(false);
      }
    },
    [toast],
  );

  const applyCoupon = React.useCallback<CartContextValue['applyCoupon']>(
    async (code) => {
      setPending(true);
      try {
        const next = await apiPost<CartDTO>('/api/cart/coupon', { code });
        setCart(next);
        if (code) toast.success('Promotion applied');
        return true;
      } catch (error) {
        toast.error('Code not applied', errorMessage(error));
        return false;
      } finally {
        setPending(false);
      }
    },
    [toast],
  );

  const value = React.useMemo<CartContextValue>(
    () => ({
      cart,
      loading,
      pending,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      refresh,
      add,
      setQuantity,
      remove,
      applyCoupon,
      itemCount: cart?.itemCount ?? 0,
    }),
    [cart, loading, pending, drawerOpen, refresh, add, setQuantity, remove, applyCoupon],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
