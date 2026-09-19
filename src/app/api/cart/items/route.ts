import { clientIp, ok, parseBody, route } from '@/lib/api';
import { assertCsrf, getOrCreateGuestToken, getSessionUser } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getRequestedCurrency } from '@/lib/server-context';
import { addToCart, findOrCreateCart, priceCart, updateCartLine } from '@/lib/services/cart.service';
import { addToCartSchema, updateCartSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** POST /api/cart/items — add a variant to the bag. */
export const POST = route(async (request) => {
  await assertCsrf(request);
  enforceRateLimit('write', clientIp(request));

  const body = await parseBody(request, addToCartSchema);
  const [token, user, currency] = await Promise.all([
    getOrCreateGuestToken(),
    getSessionUser(),
    getRequestedCurrency(),
  ]);

  const cart = await findOrCreateCart(token, user?.id);
  await addToCart(cart.id, body.variantId, body.quantity);

  const fresh = await findOrCreateCart(token, user?.id);
  return ok(await priceCart(fresh, { displayCurrency: currency }));
});

/** PATCH /api/cart/items — change a line quantity, or remove it with 0. */
export const PATCH = route(async (request) => {
  await assertCsrf(request);
  enforceRateLimit('write', clientIp(request));

  const body = await parseBody(request, updateCartSchema);
  const [token, user, currency] = await Promise.all([
    getOrCreateGuestToken(),
    getSessionUser(),
    getRequestedCurrency(),
  ]);

  const cart = await findOrCreateCart(token, user?.id);
  await updateCartLine(cart.id, body.lineId, body.quantity);

  const fresh = await findOrCreateCart(token, user?.id);
  return ok(await priceCart(fresh, { displayCurrency: currency }));
});
