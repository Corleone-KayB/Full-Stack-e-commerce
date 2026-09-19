import { clientIp, created, route } from '@/lib/api';
import { assertCsrf, requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { duplicateProduct } from '@/lib/services/product-admin.service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/admin/products/[id]/duplicate — copy a product as a draft. */
export const POST = route<Ctx>(async (request, { params }) => {
  await assertCsrf(request);
  const user = await requirePermission('product:write');
  const { id } = await params;

  const copy = await duplicateProduct(id);

  await recordAudit({
    actor: user,
    action: 'product.duplicated',
    summary: `Duplicated a product as “${copy.name}” (draft).`,
    targetType: 'product',
    targetId: copy.id,
    meta: { sourceId: id },
    ip: clientIp(request),
  });

  return created({ id: copy.id, slug: copy.slug, name: copy.name });
});
