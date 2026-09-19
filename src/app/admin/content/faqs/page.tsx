import { requirePagePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { FaqsScreen } from '@/components/admin/resource-screens';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'FAQs' };

export default async function FaqsPage() {
  const user = await requirePagePermission('settings:read');
  const rows = await prisma.faq.findMany({ orderBy: [{ topic: 'asc' }, { position: 'asc' }] });
  return <FaqsScreen rows={rows as never} canWrite={hasPermission(user.permissions, 'content:write')} />;
}
