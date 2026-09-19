import type { Metadata } from 'next';
import { getOrCreateGuestToken, getSessionUser } from '@/lib/auth';
import { getRequestedCurrency } from '@/lib/server-context';
import { prisma } from '@/lib/db';
import { getProductBySlug } from '@/lib/services/catalog.service';
import { ProductCard } from '@/components/store/product-card';
import { EmptyState, LinkButton } from '@/components/ui';
import { Heart } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Saved items',
  robots: { index: false, follow: true },
};

export default async function WishlistPage() {
  const [user, guestToken, currency] = await Promise.all([
    getSessionUser(),
    getOrCreateGuestToken(),
    getRequestedCurrency(),
  ]);

  const items = await prisma.wishlistItem.findMany({
    where: user ? { userId: user.id } : { guestToken },
    include: { product: { select: { slug: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const products = (
    await Promise.all(items.map((item) => getProductBySlug(item.product.slug, currency ?? undefined)))
  ).filter((product): product is NonNullable<typeof product> => !!product);

  return (
    <div className="container py-10 lg:py-14">
      <header className="mb-8">
        <p className="eyebrow mb-2">Your list</p>
        <h1 className="font-display text-headline text-ink">Saved items</h1>
        {!user && products.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            These are saved on this device.{' '}
            <a href="/signin" className="text-accent underline underline-offset-4">
              Sign in
            </a>{' '}
            to keep them everywhere.
          </p>
        )}
      </header>

      {products.length === 0 ? (
        <EmptyState
          icon={<Heart className="h-6 w-6" />}
          title="Nothing saved yet"
          body="Tap the heart on any device to keep it here while you decide."
          action={<LinkButton href="/shop">Browse devices</LinkButton>}
          className="rounded-xl border border-hairline bg-surface"
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
