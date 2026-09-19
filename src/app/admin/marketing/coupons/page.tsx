import { requirePagePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { listCoupons } from '@/lib/services/taxonomy.service';
import { CouponsScreen } from '@/components/admin/resource-screens';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Coupons' };

export default async function CouponsPage() {
  const user = await requirePagePermission('order:read');
  const [rows, settings] = await Promise.all([listCoupons(), getSettings()]);

  return (
    <CouponsScreen
      rows={rows as never}
      canWrite={hasPermission(user.permissions, 'marketing:write')}
      currencyCode={settings.currency.base}
    />
  );
}
