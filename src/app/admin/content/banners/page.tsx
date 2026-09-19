import { requirePagePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { BannersScreen } from '@/components/admin/resource-screens';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Banners' };

export default async function BannersPage() {
  const user = await requirePagePermission('settings:read');
  const rows = await prisma.banner.findMany({ orderBy: { position: 'asc' } });
  return <BannersScreen rows={rows as never} canWrite={hasPermission(user.permissions, 'content:write')} />;
}
