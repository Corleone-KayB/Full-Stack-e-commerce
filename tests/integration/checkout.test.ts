import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { addToCart, computeOrderTotals, findCart, findOrCreateCart } from '@/lib/services/cart.service';
import { createOrderFromCart, markOrderPaid, transitionOrderStatus } from '@/lib/services/order.service';
import { getStock } from '@/lib/services/inventory.service';
import { guestCheckout, hasTestDb, makeCart, pickVariant } from '../helpers/fixtures';

/**
 * Checkout is where the browser is least trusted.
 *
 * The contract these tests hold the server to: the client supplies a cart
 * token, an address and an intent — nothing else it sends can change what the
 * customer is charged, and no order exists without the stock to fill it.
 */

const suite = hasTestDb ? describe : describe.skip;

suite('createOrderFromCart', () => {
  let variantId: string;
  let unitPrice: number;

  beforeEach(async () => {
    const inv = await pickVariant(5);
    variantId = inv.variantId;
    unitPrice = inv.variant.price;
    await prisma.inventory.update({
      where: { variantId },
      data: { onHand: 20, reserved: 0, backorderable: false },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('writes an order whose money comes from the database, not the request', async () => {
    const { token } = await makeCart([{ variantId, quantity: 2 }]);
    const cart = await findCart(token);
    const expected = await computeOrderTotals(cart!, { deliveryMethod: 'DELIVERY' });

    const order = await createOrderFromCart(guestCheckout(token));

    expect(order.grandTotal).toBe(expected.grandTotal);
    expect(order.subtotal).toBe(unitPrice * 2);
    expect(order.currency).toBe(expected.currency);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ quantity: 2, unitPrice, lineTotal: unitPrice * 2 });
    // subtotal − discount + delivery + tax must actually add up.
    expect(order.subtotal - order.discountTotal + order.deliveryTotal + order.taxTotal).toBe(order.grandTotal);
  });

  it('ignores a price the client tries to dictate', async () => {
    const { token } = await makeCart([{ variantId, quantity: 1 }]);
    // Nothing in CreateOrderInput accepts a price; prove the extra keys are inert.
    const order = await createOrderFromCart(
      guestCheckout(token, { unitPrice: 1, subtotal: 1, grandTotal: 1 } as Record<string, unknown>),
    );
    expect(order.items[0].unitPrice).toBe(unitPrice);
    expect(order.grandTotal).toBeGreaterThan(1);
  });

  it('accepts a matching expectedTotal', async () => {
    const { token } = await makeCart([{ variantId, quantity: 1 }]);
    const cart = await findCart(token);
    const totals = await computeOrderTotals(cart!, { deliveryMethod: 'DELIVERY' });

    const order = await createOrderFromCart(guestCheckout(token, { expectedTotal: totals.grandTotal }));
    expect(order.grandTotal).toBe(totals.grandTotal);
  });

  it('refuses a stale expectedTotal rather than charging a different amount', async () => {
    const { token } = await makeCart([{ variantId, quantity: 1 }]);
    await expect(createOrderFromCart(guestCheckout(token, { expectedTotal: 1 }))).rejects.toMatchObject({
      code: 'PRICE_CHANGED',
    });
    // No half-written order, and no stock held.
    expect((await getStock(variantId))!.reserved).toBe(0);
  });

  it('reserves stock atomically with the order', async () => {
    const { token } = await makeCart([{ variantId, quantity: 3 }]);
    const order = await createOrderFromCart(guestCheckout(token));

    const stock = await getStock(variantId);
    expect(stock).toMatchObject({ onHand: 20, reserved: 3, available: 17 });
    expect(order.status).toBe('PENDING');
    expect(order.paymentStatus).toBe('PENDING');
  });

  it('writes no order at all when stock ran out mid-checkout', async () => {
    const { token } = await makeCart([{ variantId, quantity: 5 }]);
    await prisma.inventory.update({ where: { variantId }, data: { onHand: 1, reserved: 0 } });
    const before = await prisma.order.count();

    await expect(createOrderFromCart(guestCheckout(token))).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });

    expect(await prisma.order.count()).toBe(before);
    expect((await getStock(variantId))!.reserved).toBe(0);
  });

  it('rejects an empty or unknown cart', async () => {
    const { token } = await makeCart([]);
    await expect(createOrderFromCart(guestCheckout(token))).rejects.toMatchObject({ code: 'CART_EMPTY' });
    await expect(createOrderFromCart(guestCheckout('no-such-cart'))).rejects.toMatchObject({ code: 'CART_EMPTY' });
  });

  it('rejects a line whose product has been deactivated since it was added', async () => {
    const { token } = await makeCart([{ variantId, quantity: 1 }]);
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    await prisma.product.update({ where: { id: variant!.productId }, data: { active: false } });
    try {
      await expect(createOrderFromCart(guestCheckout(token))).rejects.toMatchObject({ code: 'CONFLICT' });
    } finally {
      await prisma.product.update({ where: { id: variant!.productId }, data: { active: true } });
    }
  });

  it('requires an address for delivery but not for collection', async () => {
    const a = await makeCart([{ variantId, quantity: 1 }]);
    await expect(
      createOrderFromCart(guestCheckout(a.token, { shippingAddress: null })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const b = await makeCart([{ variantId, quantity: 1 }]);
    const pickup = await createOrderFromCart(
      guestCheckout(b.token, { deliveryMethod: 'PICKUP', shippingAddress: null }),
    );
    expect(pickup.deliveryMethod).toBe('PICKUP');
    expect(pickup.deliveryTotal).toBe(0);
  });

  it('numbers orders sequentially within a day and never reuses one', async () => {
    const numbers: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const { token } = await makeCart([{ variantId, quantity: 1 }]);
      numbers.push((await createOrderFromCart(guestCheckout(token))).orderNumber);
    }
    expect(new Set(numbers).size).toBe(3);
    for (const number of numbers) expect(number).toMatch(/^ORD-\d{8}-\d{4}$/);
    const sequences = numbers.map((n) => Number(n.slice(-4)));
    expect(sequences[1]).toBe(sequences[0] + 1);
    expect(sequences[2]).toBe(sequences[1] + 1);
  });

  it('converts the cart so it cannot be checked out twice', async () => {
    const { token } = await makeCart([{ variantId, quantity: 1 }]);
    await createOrderFromCart(guestCheckout(token));

    const row = await prisma.cart.findUnique({ where: { token } });
    expect(row!.status).toBe('CONVERTED');

    // A converted cart must read as empty everywhere the shopper can see it —
    // the header badge, /cart, and a second attempt to check out.
    expect(await findCart(token)).toBeNull();
    await expect(createOrderFromCart(guestCheckout(token))).rejects.toMatchObject({ code: 'CART_EMPTY' });
  });

  it('gives the shopper a clean bag for their next visit, keeping the same token', async () => {
    const { token } = await makeCart([{ variantId, quantity: 2 }]);
    await createOrderFromCart(guestCheckout(token));

    // The guest cookie also carries the wishlist, so it is not rotated; the
    // spent cart is reopened empty instead.
    const reopened = await findOrCreateCart(token);
    expect(reopened.status).toBe('ACTIVE');
    expect(reopened.items).toHaveLength(0);
    expect(reopened.token).toBe(token);

    await addToCart(reopened.id, variantId, 1);
    const fresh = await findCart(token);
    expect(fresh!.items).toHaveLength(1);
    expect(fresh!.items[0].quantity).toBe(1);
  });

  it('records the order with a customer-visible event', async () => {
    const { token } = await makeCart([{ variantId, quantity: 1 }]);
    const order = await createOrderFromCart(guestCheckout(token));
    const events = await prisma.orderEvent.findMany({ where: { orderId: order.id } });
    expect(events.some((e) => e.type === 'CREATED' && e.visibleToCustomer)).toBe(true);
  });
});

suite('order lifecycle', () => {
  let variantId: string;

  beforeEach(async () => {
    const inv = await pickVariant(5);
    variantId = inv.variantId;
    await prisma.inventory.update({ where: { variantId }, data: { onHand: 20, reserved: 0 } });
  });

  async function placeOrder(quantity = 1) {
    const { token } = await makeCart([{ variantId, quantity }]);
    return createOrderFromCart(guestCheckout(token));
  }

  it('marking an order paid consumes the reservation exactly once', async () => {
    const order = await placeOrder(2);
    expect((await getStock(variantId))!.reserved).toBe(2);

    await markOrderPaid(order.id, { provider: 'simulator' });
    expect(await getStock(variantId)).toMatchObject({ onHand: 18, reserved: 0 });

    // A redelivered confirmation must not deduct the stock a second time.
    await markOrderPaid(order.id, { provider: 'simulator' });
    expect(await getStock(variantId)).toMatchObject({ onHand: 18, reserved: 0 });

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh).toMatchObject({ paymentStatus: 'SUCCESSFUL', status: 'CONFIRMED' });
    expect(fresh!.paidAt).toBeTruthy();
  });

  it('cancelling an unpaid order releases the reservation', async () => {
    const order = await placeOrder(3);
    await transitionOrderStatus({ orderId: order.id, status: 'CANCELLED' });
    expect(await getStock(variantId)).toMatchObject({ onHand: 20, reserved: 0 });
  });

  it('cancelling a paid order returns the units to the shelf', async () => {
    const order = await placeOrder(2);
    await markOrderPaid(order.id, { provider: 'simulator' });
    expect((await getStock(variantId))!.onHand).toBe(18);

    await transitionOrderStatus({ orderId: order.id, status: 'CANCELLED' });
    expect(await getStock(variantId)).toMatchObject({ onHand: 20, reserved: 0 });
  });

  it('walks the happy path and stamps each milestone', async () => {
    const order = await placeOrder();
    await markOrderPaid(order.id, { provider: 'simulator' });

    await transitionOrderStatus({ orderId: order.id, status: 'PROCESSING' });
    const ready = await transitionOrderStatus({ orderId: order.id, status: 'READY' });
    expect(ready.fulfillmentStatus).toBe('READY');

    const shipped = await transitionOrderStatus({
      orderId: order.id,
      status: 'SHIPPED',
      trackingNumber: 'TRK-123',
    });
    expect(shipped).toMatchObject({ fulfillmentStatus: 'SHIPPED', trackingNumber: 'TRK-123' });
    expect(shipped.shippedAt).toBeTruthy();

    const delivered = await transitionOrderStatus({ orderId: order.id, status: 'DELIVERED' });
    expect(delivered).toMatchObject({ fulfillmentStatus: 'DELIVERED' });
    expect(delivered.deliveredAt).toBeTruthy();
  });

  it('refuses a transition the state machine does not allow', async () => {
    const order = await placeOrder();
    // A pending order cannot skip straight to shipped…
    await expect(transitionOrderStatus({ orderId: order.id, status: 'SHIPPED' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    // …and a cancelled order is terminal.
    await transitionOrderStatus({ orderId: order.id, status: 'CANCELLED' });
    await expect(transitionOrderStatus({ orderId: order.id, status: 'CONFIRMED' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('treats a transition to the current status as a no-op', async () => {
    const order = await placeOrder();
    const same = await transitionOrderStatus({ orderId: order.id, status: 'PENDING' });
    expect(same.status).toBe('PENDING');
  });

  it('refunding restores stock and marks the payment refunded', async () => {
    const order = await placeOrder(2);
    await markOrderPaid(order.id, { provider: 'simulator' });
    await transitionOrderStatus({ orderId: order.id, status: 'REFUNDED' });

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh).toMatchObject({ status: 'REFUNDED', paymentStatus: 'REFUNDED' });
    expect(fresh!.refundedTotal).toBe(order.grandTotal);
    expect(await getStock(variantId)).toMatchObject({ onHand: 20, reserved: 0 });
  });

  it('rejects an unknown order id', async () => {
    await expect(transitionOrderStatus({ orderId: 'nope', status: 'CANCELLED' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(markOrderPaid('nope', { provider: 'simulator' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
