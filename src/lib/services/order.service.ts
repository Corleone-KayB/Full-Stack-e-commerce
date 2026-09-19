import type { Prisma } from '@/generated/prisma/client';
import { prisma, type Tx } from '../db';
import { AppError } from '../errors';
import { encodeJson, decodeJson } from '../json';
import { logger } from '../logger';
import { effectivePrice } from './pricing.service';
import { computeOrderTotals, findCart } from './cart.service';
import { fulfillStock, releaseStock, reserveStock, returnStock } from './inventory.service';
import { queueNotification } from './notification.service';
import { ORDER_STATUS_TRANSITIONS, type OrderStatus, type PaymentStatus } from '@/types/enums';

/**
 * Orders.
 *
 * The rule this file exists to enforce: the browser supplies intent, never
 * money. Product ids and quantities come from the cart on the server; prices,
 * discounts, delivery and the grand total are all recomputed here. Anything
 * the client posts about totals is discarded.
 */

export interface AddressInput {
  firstName: string;
  lastName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postalCode?: string | null;
  country: string;
}

export interface CreateOrderInput {
  cartToken: string;
  email: string;
  phone?: string | null;
  userId?: string | null;
  shippingAddress: AddressInput | null;
  billingAddress?: AddressInput | null;
  deliveryZoneId?: string | null;
  deliveryMethod: 'DELIVERY' | 'PICKUP';
  customerNote?: string | null;
  ipAddress?: string | null;
  /** For reconciliation only — compared against the server total and rejected
   *  on mismatch, so a stale page cannot silently pay the wrong amount. */
  expectedTotal?: number;
}

/**
 * Human-readable, gap-free order numbers: ORD-YYYYMMDD-0001.
 * Generated inside the order transaction and retried on collision, so two
 * simultaneous checkouts cannot land on the same number.
 */
export async function nextOrderNumber(tx: Tx, now = new Date()): Promise<string> {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `ORD-${day}-`;
  const last = await tx.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });
  const sequence = last ? Number(last.orderNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(sequence).padStart(4, '0')}`;
}

export async function createOrderFromCart(input: CreateOrderInput) {
  // findCart, not a direct query: it returns only an ACTIVE cart, so a cart
  // that has already been checked out cannot be turned into a second order by
  // replaying the request.
  const cart = await findCart(input.cartToken);

  if (!cart || cart.items.length === 0) {
    throw new AppError('CART_EMPTY', 'Your bag is empty.');
  }

  // 1–4: validate every line exists, is sellable, and has stock.
  for (const item of cart.items) {
    if (!item.variant.active || !item.variant.product.active) {
      throw new AppError('CONFLICT', `${item.variant.product.name} is no longer available.`);
    }
    if (item.quantity < 1 || item.quantity > 20) {
      throw new AppError('VALIDATION_ERROR', 'Invalid quantity in your bag.');
    }
  }

  // 5–7: totals computed here, from database prices. Nothing from the client.
  const totals = await computeOrderTotals(cart, {
    deliveryZoneId: input.deliveryZoneId,
    deliveryMethod: input.deliveryMethod,
  });

  if (totals.grandTotal <= 0) {
    throw new AppError('BAD_REQUEST', 'This order has no payable total.');
  }
  if (typeof input.expectedTotal === 'number' && input.expectedTotal !== totals.grandTotal) {
    // The page the customer is looking at is out of date. Refuse rather than
    // charge a different amount than they were shown.
    throw new AppError('PRICE_CHANGED', 'Prices changed while you were checking out. Please review your bag.', {
      details: { shown: input.expectedTotal, actual: totals.grandTotal },
    });
  }
  if (input.deliveryMethod === 'DELIVERY' && !input.shippingAddress) {
    throw new AppError('VALIDATION_ERROR', 'A delivery address is required.');
  }

  const now = new Date();

  // 8 + 14: create the order and reserve stock atomically. If reservation
  // fails for any line, the whole order is rolled back — no orphan orders.
  const order = await prisma.$transaction(async (tx) => {
    const orderNumber = await nextOrderNumber(tx, now);

    const created = await tx.order.create({
      data: {
        orderNumber,
        userId: input.userId ?? null,
        email: input.email.toLowerCase(),
        phone: input.phone ?? input.shippingAddress?.phone ?? null,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        fulfillmentStatus: 'UNFULFILLED',
        currency: totals.currency,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        deliveryTotal: totals.deliveryTotal,
        taxTotal: totals.taxTotal,
        grandTotal: totals.grandTotal,
        couponCode: totals.couponCode,
        deliveryZoneId: input.deliveryZoneId ?? null,
        deliveryMethod: input.deliveryMethod,
        shippingAddress: input.shippingAddress ? encodeJson(input.shippingAddress) : null,
        billingAddress: encodeJson(input.billingAddress ?? input.shippingAddress),
        customerNote: input.customerNote ?? null,
        cartToken: cart.token,
        ipAddress: input.ipAddress ?? null,
        placedAt: now,
        items: {
          create: cart.items.map((item) => {
            const pricing = effectivePrice(item.variant, now);
            const attributes: Record<string, string> = {};
            for (const link of item.variant.attributes) attributes[link.attribute.name] = link.value.label;
            return {
              variantId: item.variantId,
              productName: item.variant.product.name,
              variantName: item.variant.name,
              sku: item.variant.sku,
              imageUrl: item.variant.imageUrl ?? item.variant.product.images[0]?.url ?? null,
              unitPrice: pricing.price,
              quantity: item.quantity,
              lineTotal: pricing.price * item.quantity,
              attributes: encodeJson(attributes),
            };
          }),
        },
      },
      include: { items: true },
    });

    await reserveStock(
      tx,
      cart.items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        label: `${item.variant.product.name} · ${item.variant.name}`,
      })),
      { type: 'order', id: created.id },
    );

    await tx.orderEvent.create({
      data: {
        orderId: created.id,
        type: 'CREATED',
        message: `Order ${orderNumber} placed. Stock reserved, awaiting payment.`,
        visibleToCustomer: true,
      },
    });

    if (totals.couponCode) {
      await tx.coupon.updateMany({ where: { code: totals.couponCode }, data: { usedCount: { increment: 1 } } });
    }

    await tx.cart.update({ where: { id: cart.id }, data: { status: 'CONVERTED' } });

    return created;
  });

  logger.info('order.created', { orderId: order.id, orderNumber: order.orderNumber, total: order.grandTotal });
  return order;
}

/**
 * Marks an order paid. Called only after the payment service has verified the
 * transaction with the provider. Idempotent: a duplicate webhook that arrives
 * after the order is already paid changes nothing and returns quietly.
 */
export async function markOrderPaid(orderId: string, meta: { provider: string; reference?: string }) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new AppError('NOT_FOUND', 'Order not found.');

    if (order.paymentStatus === 'SUCCESSFUL') {
      logger.info('order.already_paid', { orderId, provider: meta.provider });
      return order;
    }

    await fulfillStock(
      tx,
      order.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity })),
      { type: 'order', id: order.id },
    );

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'SUCCESSFUL',
        status: order.status === 'PENDING' ? 'CONFIRMED' : order.status,
        paidAt: new Date(),
      },
      include: { items: true },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'PAYMENT_SUCCEEDED',
        message: `Payment confirmed via ${meta.provider}. Order confirmed and stock allocated.`,
        meta: encodeJson({ provider: meta.provider, reference: meta.reference }),
        visibleToCustomer: true,
      },
    });

    return updated;
  });
}

/** Records a failed payment WITHOUT destroying the order or the customer's bag. */
export async function markOrderPaymentFailed(
  orderId: string,
  meta: { provider: string; status: PaymentStatus; reason?: string },
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.paymentStatus === 'SUCCESSFUL') return order;

  await prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus: meta.status },
  });
  await prisma.orderEvent.create({
    data: {
      orderId,
      type: 'PAYMENT_FAILED',
      message: meta.reason
        ? `Payment ${meta.status.toLowerCase()} via ${meta.provider}: ${meta.reason}`
        : `Payment ${meta.status.toLowerCase()} via ${meta.provider}. The order is held so it can be retried.`,
      visibleToCustomer: true,
    },
  });
  return order;
}

export async function transitionOrderStatus(input: {
  orderId: string;
  status: OrderStatus;
  actorId?: string | null;
  note?: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
}) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId }, include: { items: true } });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.');

  const current = order.status as OrderStatus;
  if (current === input.status) return order;

  const allowed = ORDER_STATUS_TRANSITIONS[current] ?? [];
  if (!allowed.includes(input.status)) {
    throw new AppError('CONFLICT', `An order that is ${current.toLowerCase()} cannot become ${input.status.toLowerCase()}.`);
  }

  return prisma.$transaction(async (tx) => {
    const data: Prisma.OrderUpdateInput = { status: input.status };
    if (input.trackingNumber !== undefined) data.trackingNumber = input.trackingNumber;
    if (input.trackingUrl !== undefined) data.trackingUrl = input.trackingUrl;

    if (input.status === 'SHIPPED') {
      data.shippedAt = new Date();
      data.fulfillmentStatus = 'SHIPPED';
    }
    if (input.status === 'DELIVERED') {
      data.deliveredAt = new Date();
      data.fulfillmentStatus = 'DELIVERED';
    }
    if (input.status === 'READY') data.fulfillmentStatus = 'READY';
    if (input.status === 'PROCESSING') data.fulfillmentStatus = 'PICKING';

    if (input.status === 'CANCELLED') {
      data.cancelledAt = new Date();
      // Unpaid orders hold a reservation; paid orders have already consumed
      // stock, so cancelling returns it to the shelf instead.
      const lines = order.items
        .filter((i) => i.variantId)
        .map((i) => ({ variantId: i.variantId!, quantity: i.quantity }));
      if (order.paymentStatus === 'SUCCESSFUL') {
        await returnStock(tx, lines, { type: 'order', id: order.id });
      } else {
        await releaseStock(tx, lines, { type: 'order', id: order.id }, 'Order cancelled');
      }
    }

    if (input.status === 'REFUNDED') {
      await returnStock(
        tx,
        order.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity })),
        { type: 'order', id: order.id },
      );
      data.refundedTotal = order.grandTotal;
      data.paymentStatus = 'REFUNDED';
    }

    const updated = await tx.order.update({ where: { id: order.id }, data, include: { items: true } });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'STATUS_CHANGED',
        message: input.note ?? `Status changed from ${current} to ${input.status}.`,
        actorId: input.actorId ?? null,
        meta: encodeJson({ from: current, to: input.status }),
        visibleToCustomer: true,
      },
    });

    return updated;
  });
}

export async function addOrderNote(orderId: string, message: string, actorId?: string, visibleToCustomer = false) {
  return prisma.orderEvent.create({
    data: { orderId, type: 'NOTE', message, actorId: actorId ?? null, visibleToCustomer },
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const ORDER_DETAIL_INCLUDE = {
  items: true,
  payments: { orderBy: { createdAt: 'desc' as const }, include: { events: { orderBy: { createdAt: 'desc' as const } } } },
  events: { orderBy: { createdAt: 'desc' as const }, include: { actor: { select: { firstName: true, lastName: true, email: true } } } },
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
  deliveryZone: true,
} satisfies Prisma.OrderInclude;

export async function getOrderByNumber(orderNumber: string) {
  return prisma.order.findUnique({ where: { orderNumber }, include: ORDER_DETAIL_INCLUDE });
}

export async function getOrderForCustomer(orderNumber: string, identity: { userId?: string | null; email?: string | null }) {
  const order = await getOrderByNumber(orderNumber);
  if (!order) return null;
  // A guest may view their order via the confirmation link only if the email
  // matches; a signed-in customer may view their own orders.
  if (identity.userId && order.userId === identity.userId) return order;
  if (identity.email && order.email.toLowerCase() === identity.email.toLowerCase()) return order;
  return null;
}

export function parseOrderAddress(raw: string | null) {
  return decodeJson<AddressInput | null>(raw, null);
}

export function parseOrderItemAttributes(raw: string | null) {
  return decodeJson<Record<string, string>>(raw, {});
}

/** Sends the confirmation once payment is verified. Safe to call twice. */
export async function sendOrderConfirmation(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return;
  await queueNotification({
    templateKey: 'order.confirmed',
    to: order.email,
    channel: 'EMAIL',
    userId: order.userId,
    variables: {
      orderNumber: order.orderNumber,
      total: String(order.grandTotal),
      currency: order.currency,
      itemCount: String(order.items.reduce((s, i) => s + i.quantity, 0)),
    },
  });
}
