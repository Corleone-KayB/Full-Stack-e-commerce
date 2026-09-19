import { clientIp, ok, parseBody, route, userAgent } from '@/lib/api';
import { assertCsrf, getSessionUser, requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { hasPermission } from '@/lib/rbac';
import {
  addOrderNote,
  getOrderByNumber,
  ORDER_DETAIL_INCLUDE,
  transitionOrderStatus,
} from '@/lib/services/order.service';
import { queueNotification } from '@/lib/services/notification.service';
import { orderPatchSchema } from '@/lib/validation';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/types/enums';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/orders/[id] — id or order number.
 *
 * A customer may read their own order; staff with order:read may read any.
 * A guest gets nothing from this endpoint — their confirmation page is served
 * server-side against the order number plus their email.
 */
export const GET = route<Ctx>(async (_request, { params }) => {
  const { id } = await params;
  const user = await getSessionUser();

  const order = await prisma.order.findFirst({
    where: { OR: [{ id }, { orderNumber: id }] },
    include: ORDER_DETAIL_INCLUDE,
  });
  if (!order) throw notFound('Order not found.');

  const isOwner = !!user && order.userId === user.id;
  const isStaff = !!user?.isAdmin && hasPermission(user.permissions, 'order:read');
  if (!isOwner && !isStaff) throw notFound('Order not found.');

  // Customers never see internal notes or staff-only events.
  if (!isStaff) {
    return ok({
      ...order,
      internalNote: null,
      ipAddress: null,
      events: order.events.filter((event) => event.visibleToCustomer),
    });
  }

  return ok(order);
});

/** PATCH /api/orders/[id] — staff status change, tracking and notes. */
export const PATCH = route<Ctx>(async (request, { params }) => {
  await assertCsrf(request);
  const user = await requirePermission('order:write');
  const { id } = await params;

  const order = await prisma.order.findFirst({ where: { OR: [{ id }, { orderNumber: id }] } });
  if (!order) throw notFound('Order not found.');

  const body = await parseBody(request, orderPatchSchema);

  if (body.status && body.status === 'CANCELLED') {
    await requirePermission('order:cancel');
  }

  if (body.status) {
    await transitionOrderStatus({
      orderId: order.id,
      status: body.status as OrderStatus,
      actorId: user.id,
      note: body.note,
      trackingNumber: body.trackingNumber,
      trackingUrl: body.trackingUrl,
    });

    if (body.notifyCustomer !== false) {
      await queueNotification({
        templateKey: body.status === 'SHIPPED' ? 'order.shipped' : 'order.status_changed',
        to: order.email,
        userId: order.userId,
        variables: {
          orderNumber: order.orderNumber,
          status: ORDER_STATUS_LABELS[body.status as OrderStatus] ?? body.status,
          trackingNumber: body.trackingNumber ?? order.trackingNumber ?? '—',
        },
      });
    }

    await recordAudit({
      actor: user,
      action: 'order.status_changed',
      summary: `Order ${order.orderNumber}: ${order.status} → ${body.status}.`,
      targetType: 'order',
      targetId: order.id,
      meta: { from: order.status, to: body.status },
      ip: clientIp(request),
      userAgent: userAgent(request),
    });
  } else {
    if (body.trackingNumber !== undefined || body.trackingUrl !== undefined) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          trackingNumber: body.trackingNumber ?? order.trackingNumber,
          trackingUrl: body.trackingUrl ?? order.trackingUrl,
        },
      });
    }
  }

  if (body.internalNote !== undefined) {
    await prisma.order.update({ where: { id: order.id }, data: { internalNote: body.internalNote } });
  }
  if (body.note && !body.status) {
    await addOrderNote(order.id, body.note, user.id, false);
    await recordAudit({
      actor: user,
      action: 'order.note_added',
      summary: `Note added to ${order.orderNumber}.`,
      targetType: 'order',
      targetId: order.id,
    });
  }

  const fresh = await getOrderByNumber(order.orderNumber);
  return ok(fresh);
});
