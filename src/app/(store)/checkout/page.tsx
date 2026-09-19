import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentCart, getStorefrontContext } from '@/lib/server-context';
import { prisma } from '@/lib/db';
import { decodeJson } from '@/lib/json';
import { listAvailableDescriptors } from '@/lib/payments/registry';
import { CheckoutFlow } from '@/components/store/checkout-flow';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const [cart, context] = await Promise.all([getCurrentCart(), getStorefrontContext()]);

  const [zoneRows, addressRow] = await Promise.all([
    prisma.deliveryZone.findMany({ where: { active: true }, orderBy: { position: 'asc' } }),
    context.user
      ? prisma.address.findFirst({
          where: { userId: context.user.id },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        })
      : Promise.resolve(null),
  ]);

  const zones = zoneRows.map((zone) => ({
    id: zone.id,
    name: `${zone.name} (${decodeJson<string[]>(zone.regions, []).slice(0, 3).join(', ')})`,
    fee: zone.fee,
    freeThreshold: zone.freeThreshold,
    minDays: zone.minDays,
    maxDays: zone.maxDays,
    pickupAvailable: zone.pickupAvailable,
  }));

  const providers = listAvailableDescriptors();

  return (
    <div className="container py-10 lg:py-14">
      <header className="mb-9">
        <Link href="/cart" className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
          ← Back to bag
        </Link>
        <h1 className="mt-3 font-display text-headline text-ink">Checkout</h1>
      </header>

      <CheckoutFlow
        initialCart={
          cart ?? {
            id: '',
            token: '',
            lines: [],
            itemCount: 0,
            issues: [],
            estimatedDelivery: context.settings.delivery.estimateCopy,
            totals: {
              subtotal: 0,
              discountTotal: 0,
              deliveryTotal: 0,
              taxTotal: 0,
              grandTotal: 0,
              currency: context.currency.code,
              freeDeliveryRemaining: null,
              couponCode: null,
              couponLabel: null,
            },
          }
        }
        zones={zones}
        providers={providers}
        pickupEnabled={context.settings.delivery.pickupEnabled}
        pickupAddress={context.settings.delivery.pickupAddress}
        securityCopy={context.settings.payments.securityCopy}
        user={
          context.user
            ? {
                email: context.user.email,
                firstName: context.user.firstName,
                lastName: context.user.lastName,
                phone: context.user.phone,
              }
            : null
        }
        defaultAddress={
          addressRow
            ? {
                firstName: addressRow.firstName,
                lastName: addressRow.lastName,
                phone: addressRow.phone,
                line1: addressRow.line1,
                line2: addressRow.line2,
                city: addressRow.city,
                region: addressRow.region,
                postalCode: addressRow.postalCode,
                country: addressRow.country,
              }
            : null
        }
      />
    </div>
  );
}
