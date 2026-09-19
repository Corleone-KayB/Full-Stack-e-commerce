'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AlertTriangle, ShoppingBag, Trash2 } from 'lucide-react';
import { useCart, useCurrency } from '@/components/providers';
import { Drawer, EmptyState, LinkButton } from '@/components/ui';
import { QuantityStepper } from './variant-picker';

/**
 * Slide-out bag.
 *
 * Shows the server's totals verbatim, surfaces any issue that would block
 * checkout (sold out, price moved) before the customer reaches the payment
 * step, and keeps the checkout CTA in view above the fold on a phone.
 */

export function CartDrawer() {
  const { cart, drawerOpen, closeDrawer, setQuantity, remove, pending } = useCart();
  const { format } = useCurrency();
  const lines = cart?.lines ?? [];

  const blocking = (cart?.issues ?? []).filter((i) => i.code !== 'PRICE_CHANGED');

  return (
    <Drawer
      open={drawerOpen}
      onClose={closeDrawer}
      title={`Your bag${cart?.itemCount ? ` · ${cart.itemCount}` : ''}`}
      footer={
        lines.length > 0 ? (
          <div className="space-y-3">
            {cart!.totals.freeDeliveryRemaining !== null && cart!.totals.freeDeliveryRemaining > 0 && (
              <p className="rounded bg-accent/8 px-3 py-2 text-xs text-accent">
                Add {format(cart!.totals.freeDeliveryRemaining)} more for complimentary delivery.
              </p>
            )}
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">Subtotal</span>
              <span className="tabular font-medium text-ink">{format(cart!.totals.subtotal)}</span>
            </div>
            {cart!.totals.discountTotal > 0 && (
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted">{cart!.totals.couponLabel ?? 'Discount'}</span>
                <span className="tabular text-positive">−{format(cart!.totals.discountTotal)}</span>
              </div>
            )}
            <p className="text-xs text-faint">Delivery and any promotion are calculated at checkout.</p>
            <LinkButton href="/checkout" size="lg" className="w-full" onClick={closeDrawer}>
              Checkout
            </LinkButton>
            <Link
              href="/cart"
              onClick={closeDrawer}
              className="block text-center text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              View full bag
            </Link>
          </div>
        ) : undefined
      }
    >
      {lines.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-6 w-6" />}
          title="Your bag is empty"
          body="Every device is inspected, warrantied and dispatched the same working day."
          action={
            <LinkButton href="/shop" onClick={closeDrawer}>
              Shop iPhone
            </LinkButton>
          }
        />
      ) : (
        <div>
          {blocking.length > 0 && (
            <div className="m-4 rounded border border-caution/40 bg-caution/8 p-3">
              <p className="flex items-center gap-2 text-xs font-medium text-caution">
                <AlertTriangle className="h-3.5 w-3.5" />
                Before you check out
              </p>
              <ul className="mt-1.5 space-y-1 pl-5 text-xs text-muted">
                {blocking.map((issue, index) => (
                  <li key={index} className="list-disc">
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="divide-y divide-hairline">
            {lines.map((line) => (
              <li key={line.id} className="flex gap-3.5 px-5 py-4">
                <Link
                  href={`/products/${line.productSlug}`}
                  onClick={closeDrawer}
                  className="product-ground relative h-[88px] w-[70px] shrink-0 overflow-hidden rounded border border-hairline"
                >
                  {line.imageUrl && (
                    <Image src={line.imageUrl} alt={line.productName} fill sizes="70px" className="object-contain p-1.5" />
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{line.productName}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">{line.variantName}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(line.id)}
                      disabled={pending}
                      aria-label={`Remove ${line.productName} from bag`}
                      className="-mr-1 shrink-0 rounded p-1 text-faint transition-colors hover:text-critical"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {line.quantityAdjusted && (
                    <p className="mt-1 text-2xs text-caution">Only {line.available} available</p>
                  )}
                  {line.priceChanged && <p className="mt-1 text-2xs text-caution">Price updated</p>}

                  <div className="mt-2.5 flex items-center justify-between">
                    <QuantityStepper
                      size="sm"
                      value={line.quantity}
                      onChange={(next) => setQuantity(line.id, next)}
                      max={Math.max(1, Math.min(20, line.available || 1))}
                    />
                    <span className="text-sm tabular font-medium text-ink">{format(line.lineTotal)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Drawer>
  );
}
