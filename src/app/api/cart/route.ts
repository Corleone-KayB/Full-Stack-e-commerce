import { ok, route } from '@/lib/api';
import { getOrCreateGuestToken, getSessionUser } from '@/lib/auth';
import { getRequestedCurrency } from '@/lib/server-context';
import { emptyCart, findCart, priceCart } from '@/lib/services/cart.service';

export const dynamic = 'force-dynamic';

/** GET /api/cart — the current bag, priced by the server. */
export const GET = route(async () => {
  const [token, user, currency] = await Promise.all([
    getOrCreateGuestToken(),
    getSessionUser(),
    getRequestedCurrency(),
  ]);

  const cart = await findCart(token);
  if (!cart) return ok(await emptyCart(token, currency));

  // Claim an anonymous cart for a customer who has since signed in.
  if (user && !cart.userId) {
    const { prisma } = await import('@/lib/db');
    await prisma.cart.update({ where: { id: cart.id }, data: { userId: user.id } });
  }

  return ok(await priceCart(cart, { displayCurrency: currency }));
});
