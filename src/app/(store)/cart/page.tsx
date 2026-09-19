import type { Metadata } from 'next';
import { getCurrentCart } from '@/lib/server-context';
import { CartPageContent } from '@/components/store/cart-page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your bag',
  robots: { index: false, follow: true },
};

export default async function CartPage() {
  const cart = await getCurrentCart();
  return (
    <div className="container py-10 lg:py-14">
      <h1 className="mb-8 font-display text-headline text-ink">Your bag</h1>
      <CartPageContent initialCart={cart} />
    </div>
  );
}
