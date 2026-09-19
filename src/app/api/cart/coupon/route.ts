import { clientIp, ok, parseBody, route } from '@/lib/api';
import { assertCsrf, getOrCreateGuestToken, getSessionUser } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getRequestedCurrency } from '@/lib/server-context';
import { applyCoupon, findOrCreateCart, priceCart } from '@/lib/services/cart.service';
import { couponSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** POST /api/cart/coupon — apply (or clear, with null) a promotion code. */
export const POST = route(async (request) => {
  await assertCsrf(request);
  // Rate limited so the endpoint cannot be used to enumerate valid codes.
  enforceRateLimit('write', clientIp(request));

  const body = await parseBody(request, couponSchema);
  const [token, user, currency] = await Promise.all([
    getOrCreateGuestToken(),
    getSessionUser(),
    getRequestedCurrency(),
  ]);

  const cart = await findOrCreateCart(token, user?.id);
  await applyCoupon(cart.id, body.code);

  const fresh = await findOrCreateCart(token, user?.id);
  return ok(await priceCart(fresh, { displayCurrency: currency }));
});
