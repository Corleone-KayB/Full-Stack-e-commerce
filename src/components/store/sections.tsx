import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, BadgeCheck, Lock, ShieldCheck, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProductCard } from './product-card';
import type { ProductSummaryDTO } from '@/types/catalog';
import type { NavSeries } from '@/lib/server-context';
import type { StoreSettings } from '@/lib/settings';

/** Shared storefront sections. Server components — no JavaScript shipped. */

export function SectionHeading({
  eyebrow,
  title,
  body,
  href,
  hrefLabel = 'View all',
  align = 'left',
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  href?: string;
  hrefLabel?: string;
  align?: 'left' | 'center';
}) {
  return (
    <div
      className={cn(
        'mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between',
        align === 'center' && 'sm:flex-col sm:items-center sm:text-center',
      )}
    >
      <div className={cn('max-w-xl', align === 'center' && 'mx-auto')}>
        {eyebrow && <p className="eyebrow mb-2.5">{eyebrow}</p>}
        <h2 className="font-display text-headline text-ink">{title}</h2>
        {body && <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{body}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="group inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-ink
                     underline-offset-4 hover:underline"
        >
          {hrefLabel}
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

export function ProductRail({
  products,
  priority = false,
}: {
  products: ProductSummaryDTO[];
  priority?: boolean;
}) {
  if (!products.length) return null;
  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} priority={priority && index < 2} />
      ))}
    </div>
  );
}

const TRUST_ICONS: Record<string, React.ReactNode> = {
  shield: <ShieldCheck className="h-5 w-5" />,
  certificate: <BadgeCheck className="h-5 w-5" />,
  truck: <Truck className="h-5 w-5" />,
  lock: <Lock className="h-5 w-5" />,
};

export function TrustRow({ statements }: { statements: StoreSettings['trust']['statements'] }) {
  if (!statements.length) return null;
  return (
    <div className="grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
      {statements.map((statement) => (
        <div key={statement.title}>
          <span className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
            {TRUST_ICONS[statement.icon] ?? <ShieldCheck className="h-5 w-5" />}
          </span>
          <h3 className="text-[15px] font-medium tracking-tight text-ink">{statement.title}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{statement.body}</p>
        </div>
      ))}
    </div>
  );
}

export function SeriesGrid({ series }: { series: NavSeries[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {series.map((item) => (
        <Link
          key={item.slug}
          href={`/shop?series=${item.slug}`}
          className="group flex flex-col justify-between rounded-lg border border-hairline bg-surface p-5
                     transition-[border-color,transform] duration-300 ease-premium hover:-translate-y-0.5 hover:border-accent/40"
        >
          <div>
            <p className="text-[15px] font-medium tracking-tight text-ink">{item.name}</p>
            {item.year && <p className="mt-0.5 text-2xs text-faint">{item.year}</p>}
          </div>
          <p className="mt-8 flex items-center justify-between text-xs text-muted">
            <span>{item.productCount} models</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </p>
        </Link>
      ))}
    </div>
  );
}

export function Hero({
  settings,
  image,
}: {
  settings: StoreSettings;
  image: { url: string; alt: string } | null;
}) {
  const { homepage } = settings;
  return (
    <section className="relative overflow-hidden border-b border-hairline">
      <div className="pointer-events-none absolute inset-0 opacity-[0.55]" aria-hidden>
        <div className="absolute left-1/2 top-[-30%] h-[720px] w-[1100px] -translate-x-1/2 rounded-full bg-accent/12 blur-[120px]" />
      </div>

      <div className="container relative grid items-center gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-24">
        <div className="max-w-xl">
          <p className="eyebrow">{homepage.heroEyebrow}</p>
          <h1 className="mt-5 whitespace-pre-line font-display text-display text-ink">{homepage.heroHeadline}</h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-muted">{homepage.heroSubhead}</p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href={homepage.heroPrimaryCta.href}
              className="inline-flex h-[52px] items-center rounded bg-ink px-8 text-[15px] font-medium
                         text-canvas shadow-subtle transition-transform duration-200 ease-premium active:scale-[0.985]"
            >
              {homepage.heroPrimaryCta.label}
            </Link>
            <Link
              href={homepage.heroSecondaryCta.href}
              className="inline-flex h-[52px] items-center rounded border border-ink/25 px-8 text-[15px]
                         font-medium text-ink transition-colors duration-200 hover:border-ink"
            >
              {homepage.heroSecondaryCta.label}
            </Link>
          </div>

          <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-hairline pt-7">
            {[
              ['42-point', 'inspection'],
              ['12 months', 'warranty'],
              ['Next day', 'UAE delivery'],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="text-[15px] font-medium tracking-tight text-ink">{value}</dt>
                <dd className="mt-0.5 text-2xs uppercase tracking-[0.1em] text-faint">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="product-ground relative aspect-[4/5] w-full overflow-hidden rounded-xl border border-hairline sm:aspect-[5/4] lg:aspect-[4/5]">
          {image ? (
            <Image
              src={image.url}
              alt={image.alt}
              fill
              priority
              sizes="(max-width: 1024px) 90vw, 45vw"
              className="object-contain p-8"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-faint">Featured device</div>
          )}
        </div>
      </div>
    </section>
  );
}
