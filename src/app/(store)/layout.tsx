import { getStorefrontContext, getCurrentCart } from '@/lib/server-context';
import { listAvailableDescriptors } from '@/lib/payments/registry';
import { Providers } from '@/components/providers';
import { Header } from '@/components/store/header';
import { Footer } from '@/components/store/footer';
import { CartDrawer } from '@/components/store/cart-drawer';

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [context, cart] = await Promise.all([getStorefrontContext(), getCurrentCart()]);
  const paymentMethods = listAvailableDescriptors()
    .filter((p) => p.kind !== 'TEST')
    .map((p) => ({ id: p.id, displayName: p.displayName, kind: p.kind }));

  return (
    <Providers
      currency={context.currency}
      supportedCurrencies={context.currencies}
      initialCart={cart}
      defaultTheme={context.settings.appearance.defaultTheme}
    >
      <div className="flex min-h-dvh flex-col">
        <Header
          storeName={context.settings.store.name}
          categories={context.categories}
          series={context.series}
          signedIn={!!context.user}
          announcement={context.settings.appearance.announcementBar}
        />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer settings={context.settings} series={context.series} paymentMethods={paymentMethods} />
      </div>
      <CartDrawer />
    </Providers>
  );
}
