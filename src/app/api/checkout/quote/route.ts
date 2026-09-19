import { z } from 'zod';
import { ok, parseBody, route } from '@/lib/api';
import { assertCsrf, getOrCreateGuestToken } from '@/lib/auth';
import { getRequestedCurrency } from '@/lib/server-context';
import { emptyCart, findCart, priceCart } from '@/lib/services/cart.service';
import { DELIVERY_METHODS } from '@/types/enums';
import { idSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const schema = z.object({
  deliveryMethod: z.enum(DELIVERY_METHODS).default('DELIVERY'),
  deliveryZoneId: idSchema.nullable().optional(),
});

/**
 * POST /api/checkout/quote
 *
 * Re-prices the bag for a delivery choice without creating anything. The
 * checkout page calls this whenever the customer switches zone or picks
 * collection, so the total on screen is always one the server calculated.
 */
export const POST = route(async (request) => {
  await assertCsrf(request);
  const body = await parseBody(request, schema);
  const [token, currency] = await Promise.all([getOrCreateGuestToken(), getRequestedCurrency()]);

  const cart = await findCart(token);
  if (!cart) return ok(await emptyCart(token, currency));

  return ok(
    await priceCart(cart, {
      deliveryMethod: body.deliveryMethod,
      deliveryZoneId: body.deliveryZoneId ?? null,
      displayCurrency: currency,
    }),
  );
});
