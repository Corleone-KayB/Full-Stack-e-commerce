import { requirePagePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { listDeliveryZones } from '@/lib/services/taxonomy.service';
import { DeliveryZonesScreen } from '@/components/admin/resource-screens';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Delivery' };

export default async function DeliverySettingsPage() {
  const user = await requirePagePermission('settings:read');
  const [rows, settings] = await Promise.all([listDeliveryZones(), getSettings()]);

  return (
    <DeliveryZonesScreen
      rows={rows as never}
      canWrite={hasPermission(user.permissions, 'settings:write')}
      currencyCode={settings.currency.base}
    />
  );
}
