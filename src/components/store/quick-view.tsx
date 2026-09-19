'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { apiGet } from '@/lib/client-api';
import { useCart, useCurrency } from '@/components/providers';
import { Badge, Button, Modal, Skeleton } from '@/components/ui';
import { QuantityStepper, StockLine, useVariantSelection, VariantAxes } from './variant-picker';
import type { ProductDetailDTO } from '@/types/catalog';

/**
 * Quick view.
 *
 * A real purchase surface, not a preview: full variant selection, live stock
 * and add-to-bag. Product detail is fetched on open so the catalogue page
 * ships no extra payload for products nobody looks at closely.
 */

export function QuickViewDialog({
  slug,
  open,
  onClose,
  onAdded,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
  onAdded?: () => void;
}) {
  const [product, setProduct] = React.useState<ProductDetailDTO | null>(null);
  const [quantity, setQuantity] = React.useState(1);
  const [adding, setAdding] = React.useState(false);
  const { add } = useCart();
  const { format } = useCurrency();
  const selection = useVariantSelection(product);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiGet<ProductDetailDTO>(`/api/products/${slug}`)
      .then((data) => {
        if (!cancelled) setProduct(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug, open]);

  const variant = selection.variant;
  const available = variant?.stock?.available ?? 0;
  const image =
    variant?.imageUrl ??
    product?.images.find((i) => i.variantId === variant?.id)?.url ??
    product?.image?.url ??
    null;

  async function onAdd() {
    if (!variant) return;
    setAdding(true);
    const okResult = await add(variant.id, quantity, { name: `${product?.name} · ${variant.name}` });
    setAdding(false);
    if (okResult) onAdded?.();
  }

  return (
    <Modal open={open} onClose={onClose} title={product?.name ?? 'Loading…'} size="lg">
      {!product ? (
        <div className="grid gap-6 sm:grid-cols-2">
          <Skeleton className="aspect-square rounded-lg" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      ) : (
        <div className="grid gap-7 sm:grid-cols-2">
          <div className="product-ground relative aspect-square overflow-hidden rounded-lg border border-hairline">
            {image && (
              <Image
                src={image}
                alt={product.name}
                fill
                sizes="(max-width: 640px) 90vw, 380px"
                className="object-contain p-6"
              />
            )}
            {variant?.price.discountPercent && (
              <span className="absolute left-3 top-3">
                <Badge tone="accent">−{variant.price.discountPercent}%</Badge>
              </span>
            )}
          </div>

          <div className="flex flex-col">
            {product.series && <p className="eyebrow">{product.series.name}</p>}
            <h3 className="mt-1 font-display text-2xl tracking-tight text-ink">{product.name}</h3>

            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-2xl font-medium tabular tracking-tight text-ink">
                {format(variant?.displayPrice ?? product.fromPrice)}
              </span>
              {variant?.displayCompareAt && (
                <span className="text-sm tabular text-faint line-through">
                  {format(variant.displayCompareAt, { showCode: false })}
                </span>
              )}
            </div>

            {product.shortDescription && (
              <p className="mt-3 text-sm leading-relaxed text-muted">{product.shortDescription}</p>
            )}

            <VariantAxes product={product} selection={selection} className="mt-6" />

            <div className="mt-5">
              <StockLine variant={variant} />
            </div>

            <div className="mt-5 flex items-center gap-3">
              <QuantityStepper
                value={quantity}
                onChange={setQuantity}
                max={Math.max(1, Math.min(20, available || 1))}
              />
              <Button
                className="flex-1"
                onClick={onAdd}
                loading={adding}
                loadingLabel="Adding…"
                disabled={!variant || available <= 0}
              >
                {available <= 0 ? 'Sold out' : 'Add to bag'}
              </Button>
            </div>

            <Link
              href={`/products/${product.slug}`}
              className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent underline-offset-4 hover:underline"
            >
              Full details
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
