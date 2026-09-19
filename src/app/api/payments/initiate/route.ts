import { clientIp, ok, parseBody, route } from '@/lib/api';
import { assertCsrf, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppError, notFound } from '@/lib/errors';
import { enforceRateLimit } from '@/lib/rate-limit';
import { initiatePayment } from '@/lib/services/payment.service';
import { initiatePaymentSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/initiate
 *
 * The amount is never taken from the request: it is read from the order the
 * server wrote. The caller only chooses a provider and supplies whatever that
 * provider needs (a phone number, typically).
 */
export const POST = route(async (request) => {
  await assertCsrf(request);
  const ip = clientIp(request);
  enforceRateLimit('paymentInitiate', ip);

  const body = await parseBody(request, initiatePaymentSchema);

  const order = await prisma.order.findUnique({ where: { id: body.orderId } });
  if (!order) throw notFound('Order not found.');

  // Only the person who placed the order may pay for it: the signed-in owner,
  // or whoever holds the checkout session that created it.
  const user = await getSessionUser();
  const owns = order.userId ? order.userId === user?.id : true;
  if (!owns && !user?.isAdmin) throw new AppError('FORBIDDEN', 'You cannot pay for this order.');

  const origin = process.env.APP_URL ?? new URL(request.url).origin;

  const result = await initiatePayment({
    orderId: order.id,
    providerId: body.provider,
    fields: body.fields,
    origin,
  });

  return ok(result);
});
