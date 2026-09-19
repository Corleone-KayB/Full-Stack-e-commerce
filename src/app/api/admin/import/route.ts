import { clientIp, ok, parseBody, route, userAgent } from '@/lib/api';
import { assertCsrf, requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { commitProductImport, planProductImport } from '@/lib/services/import-export.service';
import { csvImportSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/import
 *
 * mode=validate → returns a change plan and every problem, writes nothing.
 * mode=commit   → applies the plan, refusing if any error remains.
 */
export const POST = route(async (request) => {
  await assertCsrf(request);
  const user = await requirePermission('product:write');
  const body = await parseBody(request, csvImportSchema);

  if (body.mode === 'validate') {
    return ok(await planProductImport(body.csv));
  }

  const result = await commitProductImport(body.csv, user.id);

  await recordAudit({
    actor: user,
    action: 'import.committed',
    summary: `CSV import: ${result.updatedVariants} SKU(s) and ${result.updatedProducts} product(s) updated, ${result.stockMovements} stock change(s).`,
    targetType: 'import',
    meta: result,
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return ok(result);
});
