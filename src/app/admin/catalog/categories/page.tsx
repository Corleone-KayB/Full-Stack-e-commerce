import { requirePagePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { listAttributes, listCategories } from '@/lib/services/taxonomy.service';
import { CategoriesScreen } from '@/components/admin/resource-screens';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Categories' };

export default async function CategoriesPage() {
  const user = await requirePagePermission('product:read');
  const [rows, attributes] = await Promise.all([listCategories(), listAttributes()]);

  return (
    <CategoriesScreen
      rows={rows as never}
      attributes={attributes.map((a) => ({ id: a.id, name: a.name }))}
      canWrite={hasPermission(user.permissions, 'taxonomy:write')}
    />
  );
}
