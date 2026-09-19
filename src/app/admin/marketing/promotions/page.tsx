import { requirePagePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/rbac';
import { formatMoney } from '@/lib/money';
import { getCurrency } from '@/lib/services/currency.service';
import { PromotionsScreen } from '@/components/admin/promotions-screen';
import { PageHeader } from '@/components/admin/data-table';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Promotions' };

export default async function PromotionsPage() {
  const user = await requirePagePermission('product:read');

  const [schedules, variants, currency] = await Promise.all([
    prisma.priceSchedule.findMany({
      orderBy: { startsAt: 'desc' },
      take: 100,
      include: { variant: { select: { id: true, sku: true, name: true, price: true, product: { select: { name: true } } } } },
    }),
    prisma.productVariant.findMany({
      where: { active: true, product: { active: true } },
      orderBy: [{ product: { name: 'asc' } }, { position: 'asc' }],
      select: { id: true, sku: true, name: true, price: true, product: { select: { name: true } } },
      take: 400,
    }),
    getCurrency('AED'),
  ]);

  const now = new Date();

  return (
    <>
      <PageHeader
        title="Scheduled pricing"
        description="A promotion layers a price on top of the list price for a window. The list price is never overwritten, so an offer can be scheduled ahead, previewed and rolled back."
      />
      <PromotionsScreen
        canWrite={hasPermission(user.permissions, 'price:write')}
        currencyCode={currency.code}
        rows={schedules.map((schedule) => ({
          id: schedule.id,
          label: schedule.label,
          sku: schedule.variant.sku,
          productName: schedule.variant.product.name,
          variantName: schedule.variant.name,
          listPrice: formatMoney(schedule.variant.price, currency),
          price: formatMoney(schedule.price, currency),
          startsAt: schedule.startsAt.toISOString(),
          endsAt: schedule.endsAt?.toISOString() ?? null,
          active: schedule.active,
          live: schedule.active && schedule.startsAt <= now && (!schedule.endsAt || schedule.endsAt > now),
        }))}
        variants={variants.map((variant) => ({
          id: variant.id,
          label: `${variant.product.name} · ${variant.name} (${formatMoney(variant.price, currency)})`,
        }))}
      />
    </>
  );
}
