import { requirePagePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { PagesScreen } from '@/components/admin/resource-screens';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pages' };

export default async function ContentPagesPage() {
  const user = await requirePagePermission('settings:read');
  const rows = await prisma.contentPage.findMany({ orderBy: { position: 'asc' } });
  return <PagesScreen rows={rows as never} canWrite={hasPermission(user.permissions, 'content:write')} />;
}
