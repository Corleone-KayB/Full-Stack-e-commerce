import { requirePagePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { listAttributes } from '@/lib/services/taxonomy.service';
import { AttributesScreen } from '@/components/admin/resource-screens';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Attributes' };

export default async function AttributesPage() {
  const user = await requirePagePermission('product:read');
  const rows = await listAttributes();
  return <AttributesScreen rows={rows as never} canWrite={hasPermission(user.permissions, 'taxonomy:write')} />;
}
