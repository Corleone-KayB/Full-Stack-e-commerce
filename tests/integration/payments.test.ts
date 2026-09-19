import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { hmacHex, webhookEventKey } from '@/lib/payments/signature';
import { __resetSimulator } from '@/lib/payments/providers/simulator';
import { getProvider, listAvailableDescriptors, paymentsEnvironment } from '@/lib/payments/registry';
import { initiatePayment, processWebhook, refundPayment, verifyAndSettle } from '@/lib/services/payment.service';
import { createOrderFromCart } from '@/lib/services/order.service';
import { getStock } from '@/lib/services/inventory.service';
import { guestCheckout, hasTestDb, makeCart, pickVariant } from '../helpers/fixtures';

/**
 * Payments.
 *
 * The simulator's outcome is chosen by the last digit of the phone number
 * (…0 succeeds immediately, …3 fails on funds, …4 never confirms), which lets
 * every branch of the settlement logic run without provider credentials.
 *
 * What is being defended here: a webhook is a hint, never a fact. Nothing
 * marks an order paid except a server-side verification whose amount and
 * currency match the order, and a redelivered webhook must change nothing.
 */

const suite = hasTestDb ? describe : describe.skip;

const WEBHOOK_SECRET = process.env.AUTH_SECRET ?? 'test-secret-not-used-anywhere-real';

function signedWebhook(body: Record<string, unknown>, secret = WEBHOOK_SECRET) {
  const rawBody = JSON.stringify(body);
  return {
    rawBody,
    url: 'http://localhost/api/payments/webhook/simulator',
    headers: new Headers({ 'x-sim-signature': hmacHex(secret, rawBody) }),
  };
}

suite('payment provider registry', () => {
  it('runs the test suite in sandbox, never live', () => {
    expect(paymentsEnvironment()).toBe('sandbox');
  });

  it('offers the simulator as a configured provider in sandbox', () => {
    const ids = listAvailableDescriptors().map((d) => d.id);
    expect(ids).toContain('simulator');
  });

  it('refuses a provider that is not enabled', () => {
    expect(() => getProvider('paypal')).toThrowError(/not available/i);
  });

  it('refuses a real provider that has no credentials configured', () => {
    // MTN is enabled in the test env but has no subscription key, so it must
    // be visible to the admin and unusable at checkout.
    expect(() => getProvider('mtn_momo')).toThrowError(/not activated/i);
    expect(listAvailableDescriptors().map((d) => d.id)).not.toContain('mtn_momo');
  });

  it('validates provider fields before anything is charged', () => {
    const simulator = getProvider('simulator');
    expect(() => simulator.validateFields({ msisdn: '12' })).toThrowError(/test mobile number/i);
    expect(simulator.validateFields({ msisdn: '+250 (78) 123-4560' })).toEqual({ msisdn: '250781234560' });
  });

  it('never advertises a card provider that would need a raw PAN', () => {
    for (const descriptor of listAvailableDescriptors()) {
      const fieldNames = descriptor.requiredFields.map((f) => f.name.toLowerCase()).join(' ');
      expect(fieldNames).not.toMatch(/card_?number|pan|cvv|cvc|expiry/);
    }
  });
});

suite('payment settlement', () => {
  let variantId: string;

  beforeEach(async () => {
    __resetSimulator();
    const inv = await pickVariant(5);
    variantId = inv.variantId;
    await prisma.inventory.update({ where: { variantId }, data: { onHand: 20, reserved: 0 } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function placeOrder(quantity = 1) {
    const { token } = await makeCart([{ variantId, quantity }]);
    return createOrderFromCart(guestCheckout(token));
  }

  async function pay(orderId: string, msisdn: string) {
    return initiatePayment({
      orderId,
      providerId: 'simulator',
      fields: { msisdn },
      origin: 'http://localhost:3000',
    });
  }

  it('settles an immediately-approved payment and confirms the order', async () => {
    const order = await placeOrder(2);
    const result = await pay(order.id, '0781234560'); // …0 → instant success

    expect(result.status).toBe('SUCCESSFUL');

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh).toMatchObject({ paymentStatus: 'SUCCESSFUL', status: 'CONFIRMED' });
    // Reservation became a sale.
    expect(await getStock(variantId)).toMatchObject({ onHand: 18, reserved: 0 });
  });

  it('holds an order in flight while the customer approves on their handset', async () => {
    const order = await placeOrder();
    const result = await pay(order.id, '0781234561'); // …1 → approved after a delay

    expect(result.status).toBe('PROCESSING');
    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh!.paymentStatus).toBe('PROCESSING');
    expect(fresh!.status).toBe('PENDING');
    // Stock stays reserved — not sold, not released.
    expect(await getStock(variantId)).toMatchObject({ onHand: 20, reserved: 1 });
  });

  it('records the payment against the order with an audit trail', async () => {
    const order = await placeOrder();
    const result = await pay(order.id, '0781234560');

    const payment = await prisma.payment.findUnique({
      where: { id: result.paymentId },
      include: { events: true },
    });
    expect(payment).toMatchObject({
      orderId: order.id,
      provider: 'simulator',
      amount: order.grandTotal,
      currency: order.currency,
      environment: 'sandbox',
    });
    expect(payment!.events.length).toBeGreaterThan(0);
  });

  it('stores only a masked payer and a hash — never the raw number', async () => {
    const order = await placeOrder();
    const result = await pay(order.id, '0781234560');
    const payment = await prisma.payment.findUnique({ where: { id: result.paymentId } });

    expect(payment!.payerMasked).not.toContain('0781234560');
    expect(payment!.payerHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(payment)).not.toContain('0781234560');
  });

  it('leaves the order payable after a declined payment', async () => {
    const order = await placeOrder();
    const result = await pay(order.id, '0781234563'); // …3 → insufficient funds
    // The decline lands after the simulated delay; force the check.
    await prisma.payment.update({
      where: { id: result.paymentId },
      data: { expiresAt: new Date(Date.now() + 60_000) },
    });

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh!.paymentStatus).not.toBe('SUCCESSFUL');
    expect(fresh!.status).toBe('PENDING');
    // The reservation is still held so the customer can retry.
    expect((await getStock(variantId))!.reserved).toBe(1);
  });

  it('expires a payment that is never confirmed, and does not sell the stock', async () => {
    const order = await placeOrder();
    const result = await pay(order.id, '0781234564'); // …4 → never confirms
    await prisma.payment.update({
      where: { id: result.paymentId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const settled = await verifyAndSettle(result.paymentId);
    expect(settled).toMatchObject({ status: 'EXPIRED', orderPaid: false });

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh!.paymentStatus).toBe('EXPIRED');
    expect((await getStock(variantId))!.onHand).toBe(20);
  });

  it('refuses to start a second payment on an order already paid', async () => {
    const order = await placeOrder();
    await pay(order.id, '0781234560');
    await expect(pay(order.id, '0781234560')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses to pay a cancelled order', async () => {
    const order = await placeOrder();
    await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    await expect(pay(order.id, '0781234560')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses to settle a confirmed payment whose amount does not match the order', async () => {
    const order = await placeOrder();
    const result = await pay(order.id, '0781234561'); // in flight

    // The provider comes back "successful" for a different amount than we asked
    // for. That is a bug or an attack, and must never become a sale.
    await prisma.payment.update({
      where: { id: result.paymentId },
      data: { chargedAmount: order.grandTotal + 50_000, status: 'PROCESSING' },
    });
    // Let the simulator resolve.
    await new Promise((resolve) => setTimeout(resolve, 6100));

    const settled = await verifyAndSettle(result.paymentId);
    expect(settled).toMatchObject({ status: 'FAILED', orderPaid: false });

    const payment = await prisma.payment.findUnique({ where: { id: result.paymentId } });
    expect(payment!.failureCode).toBe('amount_mismatch');
    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh!.paymentStatus).not.toBe('SUCCESSFUL');
    // Not sold.
    expect((await getStock(variantId))!.onHand).toBe(20);
  }, 20_000);

  it('is idempotent when the same settlement runs twice', async () => {
    const order = await placeOrder(2);
    const result = await pay(order.id, '0781234560');

    await verifyAndSettle(result.paymentId);
    await verifyAndSettle(result.paymentId);

    expect(await getStock(variantId)).toMatchObject({ onHand: 18, reserved: 0 });
    const fulfilments = await prisma.inventoryMovement.count({
      where: { variantId, type: 'FULFILL', referenceId: order.id },
    });
    expect(fulfilments).toBe(1);
  });
});

suite('webhooks', () => {
  let variantId: string;

  beforeEach(async () => {
    __resetSimulator();
    const inv = await pickVariant(5);
    variantId = inv.variantId;
    await prisma.inventory.update({ where: { variantId }, data: { onHand: 20, reserved: 0 } });
  });

  async function inFlightPayment() {
    const { token } = await makeCart([{ variantId, quantity: 1 }]);
    const order = await createOrderFromCart(guestCheckout(token));
    const payment = await initiatePayment({
      orderId: order.id,
      providerId: 'simulator',
      fields: { msisdn: '0781234561' },
      origin: 'http://localhost:3000',
    });
    return { order, payment };
  }

  it('rejects a webhook whose signature does not verify, and touches nothing', async () => {
    const { order, payment } = await inFlightPayment();
    const forged = signedWebhook(
      { eventId: 'evt_forged', type: 'payment.succeeded', externalRef: payment.externalRef, status: 'SUCCESSFUL' },
      'the-wrong-secret',
    );

    const outcome = await processWebhook('simulator', forged);
    expect(outcome).toMatchObject({ accepted: false, reason: 'invalid_signature' });

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh!.paymentStatus).not.toBe('SUCCESSFUL');
    expect((await getStock(variantId))!.onHand).toBe(20);
  });

  it('records the rejection so repeated forgery is visible', async () => {
    const { payment } = await inFlightPayment();
    await processWebhook(
      'simulator',
      signedWebhook({ eventId: 'evt_forged_2', externalRef: payment.externalRef }, 'wrong'),
    );
    const rejected = await prisma.paymentEvent.findFirst({
      where: { provider: 'simulator', signatureValid: false },
      orderBy: { createdAt: 'desc' },
    });
    expect(rejected).toBeTruthy();
    expect(rejected!.type).toMatch(/rejected$/);
  });

  it('accepts a correctly signed webhook and re-verifies with the provider', async () => {
    const { order, payment } = await inFlightPayment();
    // The simulator only resolves after ~6s; a webhook arriving early must not
    // shortcut the verification.
    const early = await processWebhook(
      'simulator',
      signedWebhook({
        eventId: 'evt_early',
        type: 'payment.succeeded',
        externalRef: payment.externalRef,
        status: 'SUCCESSFUL',
      }),
    );
    expect(early.accepted).toBe(true);
    expect(early.status).not.toBe('SUCCESSFUL');
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.paymentStatus).not.toBe('SUCCESSFUL');

    await new Promise((resolve) => setTimeout(resolve, 6100));

    const later = await processWebhook(
      'simulator',
      signedWebhook({
        eventId: 'evt_later',
        type: 'payment.succeeded',
        externalRef: payment.externalRef,
        status: 'SUCCESSFUL',
      }),
    );
    expect(later).toMatchObject({ accepted: true, duplicate: false, status: 'SUCCESSFUL' });
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.paymentStatus).toBe('SUCCESSFUL');
  }, 20_000);

  it('treats a redelivered webhook as a duplicate and changes nothing', async () => {
    const { order, payment } = await inFlightPayment();
    await new Promise((resolve) => setTimeout(resolve, 6100));

    const body = {
      eventId: 'evt_once',
      type: 'payment.succeeded',
      externalRef: payment.externalRef,
      status: 'SUCCESSFUL',
    };

    const first = await processWebhook('simulator', signedWebhook(body));
    expect(first).toMatchObject({ accepted: true, duplicate: false, status: 'SUCCESSFUL' });

    const second = await processWebhook('simulator', signedWebhook(body));
    const third = await processWebhook('simulator', signedWebhook(body));
    expect(second).toMatchObject({ accepted: true, duplicate: true });
    expect(third).toMatchObject({ accepted: true, duplicate: true });

    // One event row, one order, one stock deduction.
    const events = await prisma.paymentEvent.count({
      where: { idempotencyKey: webhookEventKey('simulator', 'evt_once') },
    });
    expect(events).toBe(1);
    expect(await prisma.order.count({ where: { id: order.id } })).toBe(1);
    expect(await getStock(variantId)).toMatchObject({ onHand: 19, reserved: 0 });
    expect(
      await prisma.inventoryMovement.count({ where: { variantId, type: 'FULFILL', referenceId: order.id } }),
    ).toBe(1);
  }, 25_000);

  it('accepts but ignores a webhook for a reference it does not know', async () => {
    const outcome = await processWebhook(
      'simulator',
      signedWebhook({ eventId: 'evt_unknown', type: 'payment.succeeded', externalRef: 'not-a-real-ref' }),
    );
    expect(outcome).toMatchObject({ accepted: true, reason: 'unknown_payment' });
  });

  it('rejects an unparseable body without throwing at the route', async () => {
    const outcome = await processWebhook('simulator', {
      rawBody: 'this is not json',
      url: 'http://localhost/api/payments/webhook/simulator',
      headers: new Headers(),
    });
    expect(outcome).toMatchObject({ accepted: false, reason: 'unparseable' });
  });
});

suite('refunds', () => {
  let variantId: string;

  beforeEach(async () => {
    __resetSimulator();
    const inv = await pickVariant(5);
    variantId = inv.variantId;
    await prisma.inventory.update({ where: { variantId }, data: { onHand: 20, reserved: 0 } });
  });

  async function paidOrder() {
    const { token } = await makeCart([{ variantId, quantity: 1 }]);
    const order = await createOrderFromCart(guestCheckout(token));
    const payment = await initiatePayment({
      orderId: order.id,
      providerId: 'simulator',
      fields: { msisdn: '0781234560' },
      origin: 'http://localhost:3000',
    });
    return { order, payment };
  }

  it('refunds in full and marks order and payment refunded', async () => {
    const { order, payment } = await paidOrder();
    const result = await refundPayment({ paymentId: payment.paymentId, reason: 'Customer returned it' });

    expect(result.status).toBe('REFUNDED');
    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh).toMatchObject({ paymentStatus: 'REFUNDED', status: 'REFUNDED' });
    expect(fresh!.refundedTotal).toBe(order.grandTotal);
  });

  it('supports a partial refund without closing the payment', async () => {
    const { order, payment } = await paidOrder();
    const half = Math.floor(order.grandTotal / 2);
    const result = await refundPayment({ paymentId: payment.paymentId, amount: half });

    expect(result.status).toBe('PARTIALLY_REFUNDED');
    const row = await prisma.payment.findUnique({ where: { id: payment.paymentId } });
    expect(row).toMatchObject({ status: 'PARTIALLY_REFUNDED', refundedAmount: half });
  });

  it('refuses to refund more than was taken', async () => {
    const { order, payment } = await paidOrder();
    await expect(
      refundPayment({ paymentId: payment.paymentId, amount: order.grandTotal + 1 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('refuses to refund a payment that never succeeded', async () => {
    const { token } = await makeCart([{ variantId, quantity: 1 }]);
    const order = await createOrderFromCart(guestCheckout(token));
    const pending = await initiatePayment({
      orderId: order.id,
      providerId: 'simulator',
      fields: { msisdn: '0781234561' },
      origin: 'http://localhost:3000',
    });
    await expect(refundPayment({ paymentId: pending.paymentId })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses an unknown payment', async () => {
    await expect(refundPayment({ paymentId: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('writes a refund event on the order', async () => {
    const { order, payment } = await paidOrder();
    await refundPayment({ paymentId: payment.paymentId, reason: 'Faulty' });
    const events = await prisma.orderEvent.findMany({ where: { orderId: order.id, type: 'REFUNDED' } });
    expect(events).toHaveLength(1);
    expect(events[0].message).toContain('Faulty');
  });
});
