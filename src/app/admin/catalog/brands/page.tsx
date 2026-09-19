import { requirePagePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { listBrands } from '@/lib/services/taxonomy.service';
import { BrandsScreen } from '@/components/admin/resource-screens';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Brands' };

export default async function BrandsPage() {
  const user = await requirePagePermission('product:read');
  const rows = await listBrands();
  return <BrandsScreen rows={rows as never} canWrite={hasPermission(user.permissions, 'taxonomy:write')} />;
}
