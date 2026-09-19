import { requirePagePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { listBrands, listCategories, listSeries } from '@/lib/services/taxonomy.service';
import { SeriesScreen } from '@/components/admin/resource-screens';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Series' };

export default async function SeriesPage() {
  const user = await requirePagePermission('product:read');
  const [rows, brands, categories] = await Promise.all([listSeries(), listBrands(), listCategories()]);

  return (
    <SeriesScreen
      rows={rows as never}
      brands={brands.map((b) => ({ id: b.id, name: b.name }))}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      canWrite={hasPermission(user.permissions, 'taxonomy:write')}
    />
  );
}
