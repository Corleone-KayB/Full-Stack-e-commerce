'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AlertTriangle, Heart, ShoppingBag, Trash2 } from 'lucide-react';
import { useCart, useCurrency, useWishlist } from '@/components/providers';
import { Button, EmptyState, Input, LinkButton } from '@/components/ui';
import { QuantityStepper } from './variant-picker';
import type { CartDTO } from '@/lib/services/cart.service';

/**
 * Full bag page.
 *
 * The drawer is for a quick glance; this is where someone changes their mind,
 * moves something to saved items, or applies a code.
 */
export function CartPageContent({ initialCart }: { initialCart: CartDTO | null }) {
  const { cart: liveCart, setQuantity, remove, applyCoupon, pending } = useCart();
  const { format } = useCurrency();
  const { toggle } = useWishlist();
  const [code, setCode] = React.useState('');

  const cart = liveCart ?? initialCart;
  const lines = cart?.lines ?? [];

  if (!cart || lines.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-6 w-6" />}
        title="Your bag is empty"
        body="Hand-checked devices, 12-month warranty, next-day delivery across the UAE."
        action={<LinkButton href="/shop">Shop iPhone</LinkButton>}
        className="rounded-xl border border-hairline bg-surface"
      />
    );
  }

  const blocking = cart.issues.filter((issue) => issue.code !== 'COUPON_INVALID');

  return (
    <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-14">
      <div>
        {blocking.length > 0 && (
          <div className="mb-6 rounded-lg border border-caution/40 bg-caution/8 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-caution">
              <AlertTriangle className="h-4 w-4" />
              Please review
            </p>
            <ul className="mt-2 space-y-1 pl-6 text-[13px] text-muted">
              {blocking.map((issue, index) => (
                <li key={index} className="list-disc">
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="divide-y divide-hairline border-y border-hairline">
          {lines.map((line) => (
            <li key={line.id} className="flex gap-4 py-5 sm:gap-6">
              <Link
                href={`/products/${line.productSlug}`}
                className="product-ground relative h-[120px] w-[96px] shrink-0 overflow-hidden rounded-lg border border-hairline"
              >
                {line.imageUrl && (
                  <Image src={line.imageUrl} alt={line.productName} fill sizes="96px" className="object-contain p-2" />
                )}
              </Link>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/products/${line.productSlug}`}
                      className="text-[15px] font-medium text-ink hover:underline underline-offset-4"
                    >
                      {line.productName}
                    </Link>
                    <p className="mt-1 text-[13px] text-muted">{line.variantName}</p>
                    <p className="mt-0.5 text-2xs text-faint">{line.sku}</p>
                  </div>
                  <p className="shrink-0 text-[15px] tabular font-medium text-ink">{format(line.lineTotal)}</p>
                </div>

                {line.quantityAdjusted && (
                  <p className="mt-2 text-xs text-caution">Only {line.available} left — quantity reduced.</p>
                )}
                {line.priceChanged && (
                  <p className="mt-2 text-xs text-caution">The price of this item changed while it was in your bag.</p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <QuantityStepper
                    size="sm"
                    value={line.quantity}
                    onChange={(next) => setQuantity(line.id, next)}
                    max={Math.max(1, Math.min(20, line.available || 1))}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void toggle(line.productId, line.productName);
                      void remove(line.id);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
                  >
                    <Heart className="h-3.5 w-3.5" />
                    Save for later
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(line.id)}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-critical"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <Link
          href="/shop"
          className="mt-6 inline-block text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          ← Continue shopping
        </Link>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl border border-hairline bg-surface p-6">
          <h2 className="text-sm font-medium uppercase tracking-[0.1em] text-ink">Summary</h2>

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular text-ink">{format(cart.totals.subtotal)}</dd>
            </div>
            {cart.totals.discountTotal > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">{cart.totals.couponLabel ?? 'Discount'}</dt>
                <dd className="tabular text-positive">−{format(cart.totals.discountTotal)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted">Delivery</dt>
              <dd className="tabular text-muted">Calculated at checkout</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-hairline pt-4">
              <dt className="text-[15px] font-medium text-ink">Estimated total</dt>
              <dd className="text-xl font-medium tabular text-ink">{format(cart.totals.grandTotal)}</dd>
            </div>
          </dl>

          {cart.totals.freeDeliveryRemaining !== null && cart.totals.freeDeliveryRemaining > 0 && (
            <p className="mt-4 rounded bg-accent/8 px-3 py-2 text-xs text-accent">
              Add {format(cart.totals.freeDeliveryRemaining)} more for complimentary delivery.
            </p>
          )}

          <form
            className="mt-5 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void applyCoupon(code.trim() || null);
              setCode('');
            }}
          >
            <label className="sr-only" htmlFor="coupon">
              Promotion code
            </label>
            <Input
              id="coupon"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Promotion code"
              className="h-10 flex-1 uppercase"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={pending}>
              Apply
            </Button>
          </form>

          {cart.totals.couponCode && (
            <p className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>
                Code <span className="text-ink">{cart.totals.couponCode}</span> applied
              </span>
              <button
                type="button"
                onClick={() => applyCoupon(null)}
                className="text-accent underline underline-offset-4"
              >
                Remove
              </button>
            </p>
          )}

          <LinkButton href="/checkout" size="lg" className="mt-6 w-full">
            Checkout
          </LinkButton>

          <p className="mt-4 text-center text-2xs leading-relaxed text-faint">
            {cart.estimatedDelivery}. Card and mobile money accepted.
          </p>
        </div>
      </aside>
    </div>
  );
}
