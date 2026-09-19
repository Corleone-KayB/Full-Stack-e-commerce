import { z } from 'zod';
import { clientIp, noContent, ok, parseBody, route } from '@/lib/api';
import { assertCsrf, getOrCreateGuestToken, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { enforceRateLimit } from '@/lib/rate-limit';
import { idSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Wishlist.
 *
 * Keyed by user id when signed in, guest cookie otherwise. The merge on login
 * lives in the sign-in route, so a guest never loses what they saved.
 */

const bodySchema = z.object({ productId: idSchema });

async function identity() {
  const [user, guestToken] = await Promise.all([getSessionUser(), getOrCreateGuestToken()]);
  return user ? { userId: user.id, guestToken: null } : { userId: null, guestToken };
}

export const GET = route(async () => {
  const { userId, guestToken } = await identity();
  const items = await prisma.wishlistItem.findMany({
    where: userId ? { userId } : { guestToken },
    select: { productId: true },
  });
  return ok(items.map((item) => item.productId));
});

export const POST = route(async (request) => {
  await assertCsrf(request);
  enforceRateLimit('write', clientIp(request));
  const { productId } = await parseBody(request, bodySchema);
  const { userId, guestToken } = await identity();

  const exists = await prisma.product.count({ where: { id: productId, active: true } });
  if (!exists) return ok({ saved: false });

  await prisma.wishlistItem
    .create({ data: { productId, userId, guestToken } })
    .catch(() => undefined); // already saved — the unique index makes this a no-op

  return ok({ saved: true });
});

export const DELETE = route(async (request) => {
  await assertCsrf(request);
  const { productId } = await parseBody(request, bodySchema);
  const { userId, guestToken } = await identity();

  await prisma.wishlistItem.deleteMany({
    where: userId ? { userId, productId } : { guestToken, productId },
  });
  return noContent();
});
