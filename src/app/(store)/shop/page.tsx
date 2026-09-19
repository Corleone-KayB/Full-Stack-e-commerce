import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PackageSearch } from 'lucide-react';
import { getRequestedCurrency } from '@/lib/server-context';
import { getSettings } from '@/lib/settings';
import { listProducts } from '@/lib/services/catalog.service';
import { catalogQuerySchema } from '@/lib/validation';
import { ProductCard } from '@/components/store/product-card';
import { ActiveFilters, FilterPanel, MobileFilterButton, Pagination, SortSelect } from '@/components/store/filters';
import { EmptyState, LinkButton } from '@/components/ui';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const settings = await getSettings();

  // A filtered view gets its own title and description, and is marked
  // canonical to /shop so the index is not diluted by every combination.
  const parts: string[] = [];
  if (params.series) parts.push(String(params.series).replace(/-/g, ' '));
  if (params.storage) parts.push(String(params.storage).toUpperCase().replace(/GB/g, ' GB'));
  if (params.q) parts.push(`“${params.q}”`);

  const title = parts.length ? `${parts.join(' · ')} — Shop` : 'Shop all iPhones';
  const hasFilters = Object.keys(params).some((key) => !['page', 'sort'].includes(key));

  return {
    title,
    description: settings.seo.defaultDescription,
    alternates: { canonical: hasFilters ? '/shop' : '/shop' },
    robots: hasFilters ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const currency = await getRequestedCurrency();
  const query = catalogQuerySchema.parse({ ...raw, currency: currency ?? undefined });
  const result = await listProducts(query);

  const heading = query.q
    ? `Results for “${query.q}”`
    : query.series?.length === 1
      ? result.facets.series.find((s) => s.value === query.series?.[0])?.label ?? 'Shop'
      : 'All devices';

  return (
    <div className="container py-10 lg:py-14">
      <header className="mb-8 lg:mb-10">
        <p className="eyebrow mb-2">Catalogue</p>
        <h1 className="font-display text-headline text-ink">{heading}</h1>
        <p className="mt-2 text-sm text-muted">
          Every device inspected, graded and warrantied. Prices include VAT.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[248px_1fr] lg:gap-12">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Suspense fallback={<div className="skeleton h-96 rounded" />}>
              <FilterPanel facets={result.facets} />
            </Suspense>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-6 flex items-center justify-between gap-3">
            <Suspense fallback={null}>
              <MobileFilterButton facets={result.facets} appliedCount={result.appliedFilterCount} />
            </Suspense>
            <p className="hidden text-sm text-muted lg:block">
              {result.total} {result.total === 1 ? 'device' : 'devices'}
            </p>
            <Suspense fallback={null}>
              <SortSelect />
            </Suspense>
          </div>

          <Suspense fallback={null}>
            <ActiveFilters facets={result.facets} total={result.total} />
          </Suspense>

          {result.items.length === 0 ? (
            <EmptyState
              icon={<PackageSearch className="h-6 w-6" />}
              title="Nothing matches those filters"
              body="Try widening the price range, or clearing a filter or two."
              action={<LinkButton href="/shop">Clear filters</LinkButton>}
              className="rounded-lg border border-hairline bg-surface"
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
                {result.items.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={index < 4} />
                ))}
              </div>
              <Suspense fallback={null}>
                <Pagination page={result.page} pageCount={result.pageCount} className="mt-12" />
              </Suspense>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

