import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { getDisplayCurrency, listCurrencies } from '@/lib/services/currency.service';
import { Providers } from '@/components/providers';
import { AdminShell } from '@/components/admin/shell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · AURUM Admin' },
  robots: { index: false, follow: false },
};

/**
 * Admin layout.
 *
 * The real gate. Middleware bounces anyone without a session cookie, but this
 * is where the session is actually resolved and the role checked — and every
 * page and API route below it checks its own permission again.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/signin?next=/admin');
  if (!user.isAdmin) redirect('/account');

  const [settings, currency, currencies, pendingOrders, lowStock] = await Promise.all([
    getSettings(),
    getDisplayCurrency(),
    listCurrencies(),
    prisma.order.count({ where: { status: 'PENDING' } }).catch(() => 0),
    prisma.inventory.count({ where: { onHand: { gt: 0, lte: 3 } } }).catch(() => 0),
  ]);

  return (
    <Providers
      currency={currency}
      supportedCurrencies={currencies}
      defaultTheme={settings.appearance.defaultTheme}
    >
      <AdminShell
        user={{ email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role }}
        permissions={user.permissions}
        counts={{ pendingOrders, lowStock }}
        storeName={settings.store.name}
      >
        {children}
      </AdminShell>
    </Providers>
  );
}
