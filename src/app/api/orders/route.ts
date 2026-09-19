import { clientIp, created, ok, parseQuery, parseBody, route } from '@/lib/api';
import { assertCsrf, createSession, getOrCreateGuestToken, getSessionUser, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createOrderFromCart } from '@/lib/services/order.service';
import { createOrderSchema, paginationSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/orders — place an order from the current cart.
 *
 * Note what this endpoint does NOT accept: prices, totals, product ids or a
 * currency. The cart is read from the server-side cookie and every figure is
 * recomputed in createOrderFromCart. `expectedTotal` is advisory only, and a
 * mismatch is rejected rather than silently charged.
 */
export const POST = route(async (request) => {
  await assertCsrf(request);
  const ip = clientIp(request);
  enforceRateLimit('checkout', ip);

  const body = await parseBody(request, createOrderSchema);
  const [cartToken, sessionUser] = await Promise.all([getOrCreateGuestToken(), getSessionUser()]);

  let userId = sessionUser?.id ?? null;

  // Optional account creation as part of checkout.
  if (!userId && body.createAccount && body.password) {
    const role = await prisma.role.findUnique({ where: { key: 'CUSTOMER' } });
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing?.passwordHash) {
      throw new AppError('CONFLICT', 'An account already exists for that email — sign in to continue.');
    }
    if (role) {
      const user = existing
        ? await prisma.user.update({
            where: { id: existing.id },
            data: {
              passwordHash: await hashPassword(body.password),
              firstName: body.shippingAddress?.firstName ?? existing.firstName,
              lastName: body.shippingAddress?.lastName ?? existing.lastName,
              phone: body.phone ?? existing.phone,
            },
          })
        : await prisma.user.create({
            data: {
              email: body.email,
              passwordHash: await hashPassword(body.password),
              firstName: body.shippingAddress?.firstName ?? null,
              lastName: body.shippingAddress?.lastName ?? null,
              phone: body.phone ?? null,
              roleId: role.id,
            },
          });
      userId = user.id;
      await createSession(user.id, { ip });
    }
  }

  const order = await createOrderFromCart({
    cartToken,
    email: body.email,
    phone: body.phone ?? null,
    userId,
    shippingAddress: body.shippingAddress ?? null,
    billingAddress: body.billingAddress ?? null,
    deliveryZoneId: body.deliveryZoneId ?? null,
    deliveryMethod: body.deliveryMethod,
    customerNote: body.customerNote ?? null,
    ipAddress: ip,
    expectedTotal: body.expectedTotal,
  });

  // Save the address to the account for next time.
  if (userId && body.shippingAddress) {
    await prisma.address
      .create({
        data: {
          userId,
          label: 'Delivery',
          ...body.shippingAddress,
          line2: body.shippingAddress.line2 ?? null,
          region: body.shippingAddress.region ?? null,
          postalCode: body.shippingAddress.postalCode ?? null,
          isDefault: true,
        },
      })
      .catch(() => undefined);
  }

  return created({
    id: order.id,
    orderNumber: order.orderNumber,
    grandTotal: order.grandTotal,
    currency: order.currency,
    status: order.status,
    paymentStatus: order.paymentStatus,
  });
});

/** GET /api/orders — the signed-in customer's own orders. */
export const GET = route(async (request) => {
  const user = await getSessionUser();
  if (!user) throw new AppError('UNAUTHENTICATED', 'Please sign in to see your orders.');

  const { page, perPage } = parseQuery(request, paginationSchema);
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { placedAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { items: { select: { productName: true, variantName: true, quantity: true, imageUrl: true } } },
    }),
    prisma.order.count({ where: { userId: user.id } }),
  ]);

  return ok(orders, { total, page, perPage });
});
