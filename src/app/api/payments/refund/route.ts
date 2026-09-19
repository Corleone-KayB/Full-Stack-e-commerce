import { clientIp, ok, parseBody, route, userAgent } from '@/lib/api';
import { assertCsrf, requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { refundPayment } from '@/lib/services/payment.service';
import { refundSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** POST /api/payments/refund — requires payment:refund. Always audited. */
export const POST = route(async (request) => {
  await assertCsrf(request);
  const user = await requirePermission('payment:refund');
  const body = await parseBody(request, refundSchema);

  const payment = await prisma.payment.findUnique({
    where: { id: body.paymentId },
    include: { order: { select: { orderNumber: true } } },
  });
  if (!payment) throw notFound('Payment not found.');

  const result = await refundPayment({
    paymentId: body.paymentId,
    amount: body.amount,
    reason: body.reason,
    actorId: user.id,
  });

  await recordAudit({
    actor: user,
    action: 'payment.refunded',
    summary: `Refunded ${result.refundedAmount} on ${payment.order.orderNumber} via ${payment.provider}.`,
    targetType: 'payment',
    targetId: payment.id,
    meta: { amount: result.refundedAmount, reason: body.reason, status: result.status },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return ok(result);
});
