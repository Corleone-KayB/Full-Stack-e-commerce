import { clientIp, noContent, ok, parseBody, route, userAgent } from '@/lib/api';
import { assertCsrf, requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { notFound } from '@/lib/errors';
import { getRequestedCurrency } from '@/lib/server-context';
import { getProductBySlug } from '@/lib/services/catalog.service';
import { deleteProduct, getAdminProduct, updateProduct } from '@/lib/services/product-admin.service';
import { productPatchSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * /api/products/[handle]
 *
 * `handle` accepts a slug (public, SEO-friendly) or an id (admin). One route
 * keeps the public URL clean without a second endpoint to secure.
 */

type Ctx = { params: Promise<{ handle: string }> };

export const GET = route<Ctx>(async (_request, { params }) => {
  const { handle } = await params;
  const currency = await getRequestedCurrency();
  const product = await getProductBySlug(handle, currency ?? undefined);
  if (product) return ok(product);

  // Not a public slug — try the admin view by id, behind a permission check.
  await requirePermission('product:read');
  const admin = await getAdminProduct(handle);
  if (!admin) throw notFound('Product not found.');
  return ok(admin);
});

export const PATCH = route<Ctx>(async (request, { params }) => {
  await assertCsrf(request);
  const user = await requirePermission('product:write');
  const { handle } = await params;

  const before = await getAdminProduct(handle);
  if (!before) throw notFound('Product not found.');

  const body = await parseBody(request, productPatchSchema);
  const product = await updateProduct(handle, body, user.id);

  const priceChanges = (body.variants ?? [])
    .filter((variant) => {
      const previous = before.variants.find((v) => v.id === variant.id);
      return previous && Math.round(variant.price * 100) !== previous.price;
    })
    .map((variant) => variant.sku);

  await recordAudit({
    actor: user,
    action: priceChanges.length ? 'price.changed' : 'product.updated',
    summary: priceChanges.length
      ? `Changed prices on ${priceChanges.length} SKU(s) of “${product.name}”.`
      : `Updated product “${product.name}”.`,
    targetType: 'product',
    targetId: product.id,
    meta: { priceChanges, fields: Object.keys(body) },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return ok(product);
});

export const DELETE = route<Ctx>(async (request, { params }) => {
  await assertCsrf(request);
  const user = await requirePermission('product:write');
  const { handle } = await params;

  const result = await deleteProduct(handle);

  await recordAudit({
    actor: user,
    action: 'product.deleted',
    summary: result.archived
      ? `Archived “${result.name}” — it appears on existing orders, so it was deactivated rather than deleted.`
      : `Deleted product “${result.name}”.`,
    targetType: 'product',
    targetId: handle,
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return result.archived ? ok({ archived: true, name: result.name }) : noContent();
});
