import { clientIp, created, ok, parseBody, parseQuery, route, userAgent } from '@/lib/api';
import { assertCsrf, requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { enforceRateLimit } from '@/lib/rate-limit';
import { listProducts } from '@/lib/services/catalog.service';
import { createProduct } from '@/lib/services/product-admin.service';
import { catalogQuerySchema, productInputSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/products — public catalogue with filters, facets and pagination.
 * POST /api/products — create a product (requires product:write).
 */

export const GET = route(async (request) => {
  enforceRateLimit('search', clientIp(request));
  const query = parseQuery(request, catalogQuerySchema);
  const result = await listProducts(query);
  return ok(result.items, {
    total: result.total,
    page: result.page,
    perPage: result.perPage,
    pageCount: result.pageCount,
    facets: result.facets,
  });
});

export const POST = route(async (request) => {
  await assertCsrf(request);
  const user = await requirePermission('product:write');
  const body = await parseBody(request, productInputSchema);

  const product = await createProduct(body, user.id);

  await recordAudit({
    actor: user,
    action: 'product.created',
    summary: `Created product “${product.name}” with ${body.variants.length} variant(s).`,
    targetType: 'product',
    targetId: product.id,
    meta: { slug: product.slug, variants: body.variants.map((v) => v.sku) },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return created(product);
});
