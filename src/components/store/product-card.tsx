'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Eye, Heart, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCart, useCurrency, useWishlist } from '@/components/providers';
import { Badge, Button } from '@/components/ui';
import { QuickViewDialog } from './quick-view';
import type { ProductSummaryDTO } from '@/types/catalog';

/**
 * Product card.
 *
 * One tap target on mobile (the whole card is a link) with the wishlist button
 * lifted out of it; on desktop, hover reveals quick view and add-to-bag
 * without shifting any layout.
 */

export function ProductCard({
  product,
  priority = false,
  compact = false,
}: {
  product: ProductSummaryDTO;
  priority?: boolean;
  compact?: boolean;
}) {
  const { format } = useCurrency();
  const { has, toggle } = useWishlist();
  const { openDrawer } = useCart();
  const [quickView, setQuickView] = React.useState(false);
  const saved = has(product.id);
  const soldOut = product.stockStatus === 'OUT_OF_STOCK';

  const storageAxis = product.axisSummary.find((a) => a.key === 'storage');

  return (
    <>
      <article
        className={cn(
          'group relative flex flex-col overflow-hidden rounded-lg border border-hairline bg-surface',
          'transition-[border-color,box-shadow,transform] duration-300 ease-premium',
          'hover:-translate-y-0.5 hover:border-ink/15 hover:shadow-lifted',
          soldOut && 'opacity-[0.72]',
        )}
      >
        <div className="product-ground relative aspect-[4/5] overflow-hidden">
          <Link href={`/products/${product.slug}`} className="absolute inset-0" aria-label={product.name}>
            {product.image ? (
              <Image
                src={product.image.url}
                alt={product.image.alt}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                priority={priority}
                className="object-contain p-5 transition-transform duration-500 ease-premium group-hover:scale-[1.04]"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-faint">No image</div>
            )}
          </Link>

          <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {product.discountPercent !== null && (
              <Badge tone="accent">−{product.discountPercent}%</Badge>
            )}
            {product.newArrival && !product.discountPercent && <Badge tone="outline">New</Badge>}
            {soldOut && <Badge tone="neutral">Sold out</Badge>}
            {!soldOut && product.stockStatus === 'LOW_STOCK' && (
              <Badge tone="caution">Only {product.totalAvailable} left</Badge>
            )}
          </div>

          <button
            type="button"
            onClick={() => toggle(product.id, product.name)}
            aria-label={saved ? `Remove ${product.name} from saved items` : `Save ${product.name}`}
            aria-pressed={saved}
            className={cn(
              'absolute right-3 top-3 rounded-full border border-hairline bg-surface/90 p-2 backdrop-blur',
              'transition-colors duration-200 hover:border-accent/50',
              saved ? 'text-accent' : 'text-muted hover:text-ink',
            )}
          >
            <Heart className={cn('h-4 w-4', saved && 'fill-current')} />
          </button>

          {!compact && (
            <div
              className="pointer-events-none absolute inset-x-3 bottom-3 flex gap-2 opacity-0 transition-all
                         duration-300 ease-premium group-hover:pointer-events-auto group-hover:opacity-100
                         max-lg:hidden translate-y-2 group-hover:translate-y-0"
            >
              <Button
                variant="secondary"
                size="sm"
                className="flex-1 backdrop-blur"
                onClick={() => setQuickView(true)}
              >
                <Eye className="h-3.5 w-3.5" />
                Quick view
              </Button>
              {!soldOut && (
                <Button
                  variant="primary"
                  size="sm"
                  aria-label={`Add ${product.name} to bag`}
                  onClick={() => setQuickView(true)}
                  className="px-3"
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4">
          {product.series && (
            <p className="mb-1 text-2xs uppercase tracking-[0.12em] text-faint">{product.series.name}</p>
          )}
          <h3 className="text-[15px] font-medium leading-snug tracking-tight text-ink">
            <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 lg:after:hidden">
              {product.name}
            </Link>
          </h3>

          {storageAxis && (
            <p className="mt-1.5 text-xs text-muted">{storageAxis.values.join(' · ')}</p>
          )}

          <div className="mt-auto flex items-end justify-between gap-2 pt-3">
            <div className="flex flex-col">
              {product.variantCount > 1 && <span className="text-2xs text-faint">From</span>}
              <span className="inline-flex items-baseline gap-2">
                <span className="text-[17px] font-medium tabular tracking-tight text-ink">
                  {format(product.fromPrice)}
                </span>
                {product.fromCompareAt && product.fromCompareAt > product.fromPrice && (
                  <span className="text-xs tabular text-faint line-through">
                    {format(product.fromCompareAt, { showCode: false })}
                  </span>
                )}
              </span>
            </div>
            {product.warrantyMonths > 0 && (
              <span className="pb-0.5 text-2xs text-faint">{product.warrantyMonths}-mo warranty</span>
            )}
          </div>
        </div>
      </article>

      {quickView && (
        <QuickViewDialog
          slug={product.slug}
          open={quickView}
          onClose={() => setQuickView(false)}
          onAdded={() => {
            setQuickView(false);
            openDrawer();
          }}
        />
      )}
    </>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
      <div className="skeleton aspect-[4/5]" />
      <div className="space-y-2.5 p-4">
        <div className="skeleton h-2.5 w-16 rounded" />
        <div className="skeleton h-3.5 w-3/4 rounded" />
        <div className="skeleton h-2.5 w-1/2 rounded" />
        <div className="skeleton h-4 w-24 rounded" />
      </div>
    </div>
  );
}
