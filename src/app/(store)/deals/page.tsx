import type { Metadata } from 'next';
import { Tag } from 'lucide-react';
import { getRequestedCurrency } from '@/lib/server-context';
import { listCurated } from '@/lib/services/catalog.service';
import { ProductCard } from '@/components/store/product-card';
import { EmptyState, LinkButton } from '@/components/ui';

export const revalidate = 120;

export const metadata: Metadata = {
  title: 'Deals',
  description: 'Live promotions and reduced devices, with the original price shown alongside.',
  alternates: { canonical: '/deals' },
};

export default async function DealsPage() {
  const currency = await getRequestedCurrency();
  const products = await listCurated('deals', 24, currency ?? undefined);

  return (
    <div className="container py-10 lg:py-14">
      <header className="mb-9 max-w-2xl">
        <p className="eyebrow mb-2">Limited</p>
        <h1 className="font-display text-headline text-ink">Current offers</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Every reduction here is a scheduled promotion with a start and end date. We show the price it was, not an
          invented one.
        </p>
      </header>

      {products.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-6 w-6" />}
          title="No promotions running"
          body="There is nothing reduced right now. Prices across the catalogue are unchanged."
          action={<LinkButton href="/shop">Browse everything</LinkButton>}
          className="rounded-xl border border-hairline bg-surface"
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {products.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
        </div>
      )}
    </div>
  );
}
