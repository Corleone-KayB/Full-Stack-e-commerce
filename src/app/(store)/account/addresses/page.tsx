import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AddressBook } from '@/components/store/account-forms';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your addresses', robots: { index: false, follow: false } };

export default async function AddressesPage() {
  const user = await requireUser();
  const addresses = await prisma.address.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl tracking-tight text-ink">Addresses</h2>
        <p className="mt-1.5 text-sm text-muted">
          Saved addresses are offered at checkout. Orders already placed keep the address they were sent to.
        </p>
      </div>
      <AddressBook initial={addresses} />
    </div>
  );
}
