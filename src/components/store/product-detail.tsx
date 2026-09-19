'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, ShieldCheck, Truck, RotateCcw, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCart, useCurrency, useWishlist } from '@/components/providers';
import { Accordion, Badge, Button, Modal } from '@/components/ui';
import { QuantityStepper, StockLine, useVariantSelection, VariantAxes } from './variant-picker';
import type { ProductDetailDTO } from '@/types/catalog';

/**
 * Product detail — purchase side.
 *
 * Desktop: gallery on the left, a sticky purchase panel on the right.
 * Mobile: gallery, then the panel inline, plus a sticky bottom bar that
 * appears once the inline Add to bag button scrolls out of view — so the
 * primary action is always one thumb-reach away without being in the way.
 */

export function ProductPurchasePanel({
  product,
  deliveryCopy,
  warrantyCopy,
}: {
  product: ProductDetailDTO;
  deliveryCopy: string;
  warrantyCopy: string;
}) {
  const router = useRouter();
  const selection = useVariantSelection(product);
  const [quantity, setQuantity] = React.useState(1);
  const [adding, setAdding] = React.useState(false);
  const [buying, setBuying] = React.useState(false);
  const { add } = useCart();
  const { format } = useCurrency();
  const { has, toggle } = useWishlist();
  const addButtonRef = React.useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = React.useState(false);

  const variant = selection.variant;
  const available = variant?.stock?.available ?? 0;
  const soldOut = !variant || available <= 0;
  const saved = has(product.id);

  React.useEffect(() => {
    setQuantity(1);
  }, [variant?.id]);

  React.useEffect(() => {
    const node = addButtonRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  async function handleAdd(then?: 'checkout') {
    if (!variant) return;
    if (then === 'checkout') setBuying(true);
    else setAdding(true);

    const okResult = await add(variant.id, quantity, { name: `${product.name} · ${variant.name}` });
    setAdding(false);
    setBuying(false);
    // router.push, not window.location: a client navigation keeps the cart
    // context alive instead of reloading the whole app to reach checkout.
    if (okResult && then === 'checkout') router.push('/checkout');
  }

  return (
    <>
      <div className="lg:sticky lg:top-24">
        <p className="eyebrow">{product.series?.name ?? product.brand.name}</p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] tracking-tight text-ink lg:text-[42px]">
          {product.name}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="outline">{product.condition.replace(/_/g, ' ').toLowerCase()}</Badge>
          {product.bestseller && <Badge tone="accent">Best seller</Badge>}
          {variant?.batteryHealth && <Badge tone="neutral">Battery {variant.batteryHealth}%</Badge>}
        </div>

        <div className="mt-6 flex flex-wrap items-baseline gap-3">
          <span className="text-3xl font-medium tabular tracking-tight text-ink">
            {format(variant?.displayPrice ?? product.fromPrice)}
          </span>
          {variant?.displayCompareAt && (
            <>
              <span className="text-base tabular text-faint line-through">
                {format(variant.displayCompareAt, { showCode: false })}
              </span>
              <Badge tone="accent">Save {variant.price.discountPercent}%</Badge>
            </>
          )}
        </div>
        {variant?.price.promotionLabel && (
          <p className="mt-1.5 text-[13px] text-accent">{variant.price.promotionLabel}</p>
        )}

        {product.shortDescription && (
          <p className="mt-5 text-[15px] leading-relaxed text-muted">{product.shortDescription}</p>
        )}

        <div className="mt-8">
          <VariantAxes product={product} selection={selection} />
        </div>

        <div className="mt-6">
          <StockLine variant={variant} />
          {variant && <p className="mt-1.5 text-2xs text-faint">SKU {variant.sku}</p>}
        </div>

        <div ref={addButtonRef} className="mt-7 space-y-3">
          <div className="flex items-center gap-3">
            <QuantityStepper
              value={quantity}
              onChange={setQuantity}
              max={Math.max(1, Math.min(20, available || 1))}
            />
            <Button
              className="flex-1"
              size="lg"
              onClick={() => handleAdd()}
              loading={adding}
              loadingLabel="Adding…"
              disabled={soldOut}
            >
              {soldOut ? 'Sold out' : 'Add to bag'}
            </Button>
            <button
              type="button"
              onClick={() => toggle(product.id, product.name)}
              aria-label={saved ? 'Remove from saved items' : 'Save for later'}
              aria-pressed={saved}
              className={cn(
                'flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded border transition-colors',
                saved ? 'border-accent text-accent' : 'border-hairline text-muted hover:border-ink/30 hover:text-ink',
              )}
            >
              <Heart className={cn('h-[18px] w-[18px]', saved && 'fill-current')} />
            </button>
          </div>

          <Button
            variant="accent"
            size="lg"
            className="w-full"
            onClick={() => handleAdd('checkout')}
            loading={buying}
            loadingLabel="Taking you to checkout…"
            disabled={soldOut}
          >
            Buy now
          </Button>
        </div>

        <ul className="mt-8 space-y-3.5 border-t border-hairline pt-7">
          {[
            [<Truck key="t" className="h-4 w-4" />, deliveryCopy],
            [<ShieldCheck key="s" className="h-4 w-4" />, warrantyCopy],
            [<RotateCcw key="r" className="h-4 w-4" />, '14-day change of mind, in original packaging.'],
          ].map(([icon, text], index) => (
            <li key={index} className="flex items-start gap-3 text-[13px] text-muted">
              <span className="mt-0.5 shrink-0 text-accent">{icon}</span>
              {text}
            </li>
          ))}
        </ul>
      </div>

      {/* Mobile sticky purchase bar */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-canvas/95 px-4 py-3 backdrop-blur-xl',
          'transition-transform duration-300 ease-premium lg:hidden',
          showStickyBar ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted">{variant?.name ?? product.name}</p>
            <p className="text-[15px] font-medium tabular text-ink">
              {format(variant?.displayPrice ?? product.fromPrice)}
            </p>
          </div>
          <Button size="md" onClick={() => handleAdd()} loading={adding} disabled={soldOut} className="px-6">
            {soldOut ? 'Sold out' : 'Add to bag'}
          </Button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

export function ProductGallery({ product }: { product: ProductDetailDTO }) {
  const [index, setIndex] = React.useState(0);
  const [zoomOpen, setZoomOpen] = React.useState(false);
  const images = product.images.length ? product.images : product.image ? [product.image] : [];
  const active = images[index];

  const go = React.useCallback(
    (direction: 1 | -1) => {
      setIndex((current) => (current + direction + images.length) % images.length);
    },
    [images.length],
  );

  if (!images.length) {
    return <div className="product-ground aspect-square rounded-xl border border-hairline" />;
  }

  return (
    <>
      {/*
        min-w-0 is load-bearing. A grid item defaults to min-width:auto, so the
        thumbnail strip below — six 62px thumbs plus gaps, wider than a phone —
        stretches this column instead of scrolling inside it, and the whole page
        gains a horizontal scrollbar. min-w-0 lets overflow-x-auto do its job.
      */}
      <div className="min-w-0 lg:sticky lg:top-24">
        <div className="product-ground group relative aspect-square overflow-hidden rounded-xl border border-hairline">
          <Image
            key={active.id}
            src={active.url}
            alt={active.alt}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 52vw"
            className="animate-fade-in object-contain p-8 lg:p-12"
          />

          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            aria-label="Zoom image"
            className="absolute right-4 top-4 rounded-full border border-hairline bg-surface/90 p-2.5 text-muted
                       opacity-0 backdrop-blur transition-opacity duration-200 hover:text-ink
                       focus-visible:opacity-100 group-hover:opacity-100"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          {images.length > 1 && (
            <>
              <GalleryArrow direction="prev" onClick={() => go(-1)} />
              <GalleryArrow direction="next" onClick={() => go(1)} />
            </>
          )}
        </div>

        {images.length > 1 && (
          <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto pb-1">
            {images.map((image, i) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`View image ${i + 1} of ${images.length}`}
                aria-current={i === index}
                className={cn(
                  'product-ground relative h-[72px] w-[62px] shrink-0 overflow-hidden rounded border transition-colors',
                  i === index ? 'border-accent' : 'border-hairline hover:border-ink/25',
                )}
              >
                <Image src={image.url} alt="" fill sizes="62px" className="object-contain p-1.5" />
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal open={zoomOpen} onClose={() => setZoomOpen(false)} title={product.name} size="lg">
        <div className="product-ground relative aspect-square w-full overflow-hidden rounded-lg">
          <Image src={active.url} alt={active.alt} fill sizes="90vw" className="object-contain p-4" />
        </div>
      </Modal>
    </>
  );
}

function GalleryArrow({ direction, onClick }: { direction: 'prev' | 'next'; onClick: () => void }) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Previous image' : 'Next image'}
      className={cn(
        'absolute top-1/2 -translate-y-1/2 rounded-full border border-hairline bg-surface/90 p-2.5',
        'text-muted backdrop-blur transition-all duration-200 hover:text-ink',
        'opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
        direction === 'prev' ? 'left-4' : 'right-4',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Specifications
// ---------------------------------------------------------------------------

export function ProductInformation({
  product,
  faqs,
}: {
  product: ProductDetailDTO;
  faqs: { id: string; question: string; answer: string }[];
}) {
  const [tab, setTab] = React.useState<'specs' | 'description' | 'faq'>('specs');
  const groups = product.specs.reduce<Record<string, typeof product.specs>>((acc, spec) => {
    (acc[spec.group] ||= []).push(spec);
    return acc;
  }, {});

  const tabs = [
    { id: 'specs' as const, label: 'Specifications' },
    ...(product.description ? [{ id: 'description' as const, label: 'About this device' }] : []),
    ...(faqs.length ? [{ id: 'faq' as const, label: 'Questions' }] : []),
  ];

  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-hairline">
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              'relative -mb-px px-4 py-3 text-[13px] font-medium transition-colors',
              tab === item.id ? 'text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {item.label}
            {tab === item.id && <span className="absolute inset-x-3 bottom-0 h-px bg-accent" aria-hidden />}
          </button>
        ))}
      </div>

      <div className="pt-7">
        {tab === 'specs' && (
          <div className="grid gap-8 sm:grid-cols-2">
            {Object.entries(groups).map(([group, rows]) => (
              <div key={group}>
                <p className="eyebrow mb-3">{group}</p>
                <dl className="divide-y divide-hairline">
                  {rows.map((row, index) => (
                    <div key={index} className="flex justify-between gap-6 py-2.5">
                      <dt className="text-[13px] text-muted">{row.label}</dt>
                      <dd className="text-right text-[13px] text-ink">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}

        {tab === 'description' && (
          <div className="max-w-2xl space-y-4 text-[15px] leading-relaxed text-muted">
            {product.description?.split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
        )}

        {tab === 'faq' && (
          <Accordion items={faqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer }))} />
        )}
      </div>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-7">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-1.5">
            {item.href ? (
              <Link href={item.href} className="transition-colors hover:text-ink">
                {item.label}
              </Link>
            ) : (
              <span className="text-ink">{item.label}</span>
            )}
            {index < items.length - 1 && <span className="text-faint">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
