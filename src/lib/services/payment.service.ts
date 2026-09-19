import { prisma } from '../db';
import { AppError } from '../errors';
import { encodeRedactedJson, redact } from '../json';
import { logger } from '../logger';
import { sha256 } from '../auth';
import { getProvider, getProviderForWebhook, paymentsEnvironment } from '../payments/registry';
import { webhookEventKey } from '../payments/signature';
import type { RawWebhook, WebhookParseResult } from '../payments/types';
import { resolveSettlement } from './currency.service';
import { markOrderPaid, markOrderPaymentFailed, sendOrderConfirmation } from './order.service';
import { queueNotification } from './notification.service';
import { TERMINAL_PAYMENT_STATUSES, type PaymentStatus } from '@/types/enums';

/**
 * Payment orchestration.
 *
 * Invariants enforced here, and nowhere else:
 *   1. A payment is only ever marked successful after the SERVER has verified
 *      it with the provider. A webhook saying "paid" triggers a verification;
 *      it does not by itself complete an order.
 *   2. Amount and currency are checked against the order. A confirmed payment
 *      for the wrong amount is a failure, not a sale.
 *   3. Every provider event is written once. The unique idempotencyKey on
 *      PaymentEvent means a redelivered webhook is a database no-op.
 *   4. A payment that fails leaves the order intact so it can be retried.
 */

export interface InitiateInput {
  orderId: string;
  providerId: string;
  fields: Record<string, string>;
  origin: string;
}

export interface InitiateResult {
  paymentId: string;
  externalRef: string;
  status: PaymentStatus;
  redirectUrl?: string;
  instruction?: string;
  expiresAt: Date | null;
  provider: { id: string; displayName: string; kind: string };
}

export async function initiatePayment(input: InitiateInput): Promise<InitiateResult> {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.');
  if (order.paymentStatus === 'SUCCESSFUL') {
    throw new AppError('CONFLICT', 'This order has already been paid.');
  }
  if (order.status === 'CANCELLED') {
    throw new AppError('CONFLICT', 'This order was cancelled and can no longer be paid.');
  }

  const provider = getProvider(input.providerId);
  const fields = provider.validateFields(input.fields);

  // Work out what the provider will actually be charged in, and freeze the rate.
  const settlementCurrency = provider.descriptor.settlementCurrencies[0] ?? order.currency;
  const settlement = await resolveSettlement(order.grandTotal, order.currency, settlementCurrency);

  const externalRef = crypto.randomUUID();
  const expiryMinutes = Number(process.env.PAYMENT_EXPIRY_MINUTES ?? 15);

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: provider.descriptor.id,
      externalRef,
      status: 'PENDING',
      amount: order.grandTotal,
      currency: order.currency,
      chargedAmount: settlement.chargeAmount,
      chargedCurrency: settlement.currency.code,
      exchangeRate: settlement.rate,
      environment: paymentsEnvironment(),
      payerMasked: fields.msisdn ? `••${fields.msisdn.slice(-3)}` : null,
      payerHash: fields.msisdn ? sha256(fields.msisdn) : null,
      expiresAt: new Date(Date.now() + expiryMinutes * 60_000),
    },
  });

  await recordPaymentEvent({
    paymentId: payment.id,
    provider: provider.descriptor.id,
    source: 'INITIATE',
    type: 'payment.initiate',
    idempotencyKey: `initiate:${externalRef}`,
    payload: { orderNumber: order.orderNumber, amount: order.grandTotal, currency: order.currency },
  });

  try {
    const result = await provider.initiatePayment({
      externalRef,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: order.grandTotal,
      currency: order.currency,
      chargeAmount: settlement.chargeAmount,
      settlementCurrency: settlement.currency.code,
      customer: { email: order.email, phone: order.phone },
      fields,
      callbackUrl: `${input.origin}/api/payments/webhook/${provider.descriptor.id}`,
      returnUrl: `${input.origin}/checkout/processing`,
      cancelUrl: `${input.origin}/checkout?payment=cancelled`,
      description: `Order ${order.orderNumber}`,
    });

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: result.status,
        providerRef: result.providerRef ?? null,
        metadata: result.metadata ? encodeRedactedJson(result.metadata) : null,
        expiresAt: result.expiresInSeconds
          ? new Date(Date.now() + result.expiresInSeconds * 1000)
          : payment.expiresAt,
      },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: result.status === 'SUCCESSFUL' ? 'PROCESSING' : result.status },
    });
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'PAYMENT_INITIATED',
        message: `Payment started with ${provider.descriptor.displayName}.`,
        visibleToCustomer: true,
      },
    });

    // Some providers confirm synchronously. Still verify before crediting.
    if (result.status === 'SUCCESSFUL') {
      await verifyAndSettle(updated.id);
    }

    return {
      paymentId: updated.id,
      externalRef,
      status: (await prisma.payment.findUnique({ where: { id: updated.id } }))!.status as PaymentStatus,
      redirectUrl: result.redirectUrl,
      instruction: result.instruction,
      expiresAt: updated.expiresAt,
      provider: {
        id: provider.descriptor.id,
        displayName: provider.descriptor.displayName,
        kind: provider.descriptor.kind,
      },
    };
  } catch (error) {
    const message = error instanceof AppError ? error.message : 'The payment could not be started.';
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failureMessage: message, completedAt: new Date() },
    });
    await markOrderPaymentFailed(order.id, {
      provider: provider.descriptor.id,
      status: 'FAILED',
      reason: message,
    });
    throw error;
  }
}

/**
 * Asks the provider what happened, checks it against the order, and settles.
 * This is the ONLY function that can mark an order paid.
 */
export async function verifyAndSettle(paymentId: string): Promise<{
  status: PaymentStatus;
  orderPaid: boolean;
  message?: string;
}> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!payment) throw new AppError('NOT_FOUND', 'Payment not found.');

  if (payment.status === 'SUCCESSFUL' && payment.order.paymentStatus === 'SUCCESSFUL') {
    return { status: 'SUCCESSFUL', orderPaid: true };
  }

  // Expired but never confirmed.
  if (
    payment.expiresAt &&
    payment.expiresAt < new Date() &&
    !TERMINAL_PAYMENT_STATUSES.includes(payment.status as PaymentStatus)
  ) {
    await finalise(payment.id, 'EXPIRED', { failureMessage: 'The payment request timed out.' });
    await markOrderPaymentFailed(payment.orderId, {
      provider: payment.provider,
      status: 'EXPIRED',
      reason: 'No confirmation received before the request expired.',
    });
    return { status: 'EXPIRED', orderPaid: false, message: 'The payment request timed out.' };
  }

  const provider = getProviderForWebhook(payment.provider);
  const verification = await provider.verifyPayment({
    externalRef: payment.externalRef,
    providerRef: payment.providerRef,
    expectedAmount: payment.chargedAmount ?? payment.amount,
    expectedCurrency: payment.chargedCurrency ?? payment.currency,
  });

  await recordPaymentEvent({
    paymentId: payment.id,
    provider: payment.provider,
    source: 'VERIFY',
    type: `verify.${verification.status.toLowerCase()}`,
    idempotencyKey: `verify:${payment.externalRef}:${verification.status}:${Date.now()}`,
    payload: redact(verification.raw ?? verification) as Record<string, unknown>,
    status: verification.status,
    message: verification.mismatchReason,
  });

  if (verification.verified && verification.status === 'SUCCESSFUL') {
    await finalise(payment.id, 'SUCCESSFUL', {
      providerRef: verification.providerRef,
      cardBrand: verification.cardBrand,
      cardLast4: verification.cardLast4,
      payerMasked: verification.payerMasked ?? payment.payerMasked ?? undefined,
    });
    await markOrderPaid(payment.orderId, { provider: payment.provider, reference: verification.providerRef });
    await sendOrderConfirmation(payment.orderId);
    await queueNotification({
      templateKey: 'payment.succeeded',
      to: payment.order.email,
      userId: payment.order.userId,
      variables: {
        orderNumber: payment.order.orderNumber,
        total: String(payment.amount),
        currency: payment.currency,
      },
    });
    return { status: 'SUCCESSFUL', orderPaid: true };
  }

  // Provider says success but the numbers do not match — refuse the sale and
  // shout, because this is either a bug or an attack.
  if (verification.status === 'SUCCESSFUL' && !verification.verified) {
    logger.error('payment.amount_mismatch', {
      paymentId: payment.id,
      reason: verification.mismatchReason,
      expected: payment.chargedAmount,
      reported: verification.capturedAmount,
    });
    await finalise(payment.id, 'FAILED', {
      failureCode: verification.mismatchReason ?? 'verification_mismatch',
      failureMessage: 'The confirmed amount did not match the order.',
    });
    await markOrderPaymentFailed(payment.orderId, {
      provider: payment.provider,
      status: 'FAILED',
      reason: 'Confirmed amount did not match the order total. Flagged for review.',
    });
    return { status: 'FAILED', orderPaid: false, message: 'Amount mismatch — flagged for review.' };
  }

  if (TERMINAL_PAYMENT_STATUSES.includes(verification.status)) {
    await finalise(payment.id, verification.status, {
      failureCode: verification.failureCode,
      failureMessage: verification.failureMessage,
    });
    await markOrderPaymentFailed(payment.orderId, {
      provider: payment.provider,
      status: verification.status,
      reason: verification.failureMessage,
    });
    if (verification.status === 'FAILED') {
      await queueNotification({
        templateKey: 'payment.failed',
        to: payment.order.email,
        userId: payment.order.userId,
        variables: { orderNumber: payment.order.orderNumber },
      });
    }
    return { status: verification.status, orderPaid: false, message: verification.failureMessage };
  }

  // Still in flight.
  if (payment.status !== verification.status) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: verification.status } });
  }
  return { status: verification.status, orderPaid: false };
}

async function finalise(
  paymentId: string,
  status: PaymentStatus,
  extra: {
    providerRef?: string;
    failureCode?: string;
    failureMessage?: string;
    cardBrand?: string;
    cardLast4?: string;
    payerMasked?: string;
  } = {},
) {
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status,
      completedAt: new Date(),
      ...(extra.providerRef ? { providerRef: extra.providerRef } : {}),
      ...(extra.failureCode ? { failureCode: extra.failureCode } : {}),
      ...(extra.failureMessage ? { failureMessage: extra.failureMessage } : {}),
      ...(extra.cardBrand ? { cardBrand: extra.cardBrand } : {}),
      ...(extra.cardLast4 ? { cardLast4: extra.cardLast4 } : {}),
      ...(extra.payerMasked ? { payerMasked: extra.payerMasked } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export interface WebhookOutcome {
  accepted: boolean;
  duplicate: boolean;
  status?: PaymentStatus;
  reason?: string;
}

/**
 * Processes an inbound provider callback.
 *
 * Order of operations matters:
 *   verify signature → dedupe → locate payment → re-verify with the provider.
 * A webhook is a *hint that something changed*, never the source of truth.
 */
export async function processWebhook(providerId: string, raw: RawWebhook): Promise<WebhookOutcome> {
  const provider = getProviderForWebhook(providerId);
  let parsed: WebhookParseResult;
  try {
    parsed = await provider.handleWebhook(raw);
  } catch (error) {
    logger.error('webhook.parse_failed', { providerId, error: String(error) });
    return { accepted: false, duplicate: false, reason: 'unparseable' };
  }

  if (!parsed.signatureValid) {
    // Record the rejection so repeated forgery attempts are visible, but do
    // not touch any payment.
    await recordPaymentEvent({
      provider: providerId,
      source: 'WEBHOOK',
      type: `${parsed.eventType}.rejected`,
      idempotencyKey: `${webhookEventKey(providerId, parsed.eventId)}:rejected:${Date.now()}`,
      payload: parsed.payload,
      signatureValid: false,
      message: parsed.message ?? 'signature_invalid',
    });
    logger.warn('webhook.signature_rejected', { providerId, reason: parsed.message });
    return { accepted: false, duplicate: false, reason: 'invalid_signature' };
  }

  // Idempotency: the unique key makes a duplicate delivery a no-op.
  const inserted = await recordPaymentEvent({
    provider: providerId,
    source: 'WEBHOOK',
    type: parsed.eventType,
    idempotencyKey: parsed.eventId,
    payload: parsed.payload,
    signatureValid: true,
    status: parsed.status,
  });
  if (!inserted) {
    logger.info('webhook.duplicate_ignored', { providerId, eventId: parsed.eventId });
    return { accepted: true, duplicate: true };
  }

  const payment = parsed.externalRef
    ? await prisma.payment.findUnique({ where: { externalRef: parsed.externalRef } })
    : parsed.providerRef
      ? await prisma.payment.findFirst({ where: { providerRef: parsed.providerRef } })
      : null;

  if (!payment) {
    logger.warn('webhook.unknown_payment', { providerId, ref: parsed.externalRef ?? parsed.providerRef });
    return { accepted: true, duplicate: false, reason: 'unknown_payment' };
  }

  await prisma.paymentEvent.updateMany({
    where: { idempotencyKey: parsed.eventId },
    data: { paymentId: payment.id },
  });

  if (parsed.providerRef && payment.providerRef !== parsed.providerRef) {
    await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: parsed.providerRef } });
  }

  // Do not trust the webhook's own status: re-verify against the provider.
  const result = await verifyAndSettle(payment.id);
  return { accepted: true, duplicate: false, status: result.status };
}

async function recordPaymentEvent(input: {
  paymentId?: string;
  provider: string;
  source: 'WEBHOOK' | 'POLL' | 'INITIATE' | 'REFUND' | 'VERIFY';
  type: string;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
  status?: string;
  signatureValid?: boolean;
  message?: string;
}): Promise<boolean> {
  try {
    await prisma.paymentEvent.create({
      data: {
        paymentId: input.paymentId ?? null,
        provider: input.provider,
        source: input.source,
        type: input.type,
        idempotencyKey: input.idempotencyKey,
        status: input.status ?? null,
        signatureValid: input.signatureValid ?? null,
        payload: input.payload ? encodeRedactedJson(input.payload) : null,
        message: input.message ?? null,
      },
    });
    return true;
  } catch (error) {
    // Unique-constraint violation ⇒ we have seen this event already.
    if (typeof error === 'object' && error && 'code' in error && (error as { code: string }).code === 'P2002') {
      return false;
    }
    logger.error('payment_event.write_failed', { error: String(error) });
    return true;
  }
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export async function refundPayment(input: {
  paymentId: string;
  amount?: number;
  reason?: string;
  actorId?: string;
}) {
  const payment = await prisma.payment.findUnique({ where: { id: input.paymentId }, include: { order: true } });
  if (!payment) throw new AppError('NOT_FOUND', 'Payment not found.');
  if (payment.status !== 'SUCCESSFUL' && payment.status !== 'PARTIALLY_REFUNDED') {
    throw new AppError('CONFLICT', 'Only a successful payment can be refunded.');
  }

  const provider = getProvider(payment.provider);
  if (!provider.descriptor.capabilities.refunds) {
    throw new AppError(
      'PROVIDER_NOT_CONFIGURED',
      `${provider.descriptor.displayName} does not support automated refunds. Refund manually and record it here.`,
    );
  }

  const maxRefundable = (payment.chargedAmount ?? payment.amount) - payment.refundedAmount;
  const amount = input.amount ?? maxRefundable;
  if (amount <= 0 || amount > maxRefundable) {
    throw new AppError('VALIDATION_ERROR', 'Refund amount exceeds what remains on this payment.');
  }

  const result = await provider.refundPayment({
    externalRef: payment.externalRef,
    providerRef: payment.providerRef ?? payment.externalRef,
    amount,
    currency: payment.chargedCurrency ?? payment.currency,
    reason: input.reason,
  });

  await recordPaymentEvent({
    paymentId: payment.id,
    provider: payment.provider,
    source: 'REFUND',
    type: `refund.${result.status.toLowerCase()}`,
    idempotencyKey: `refund:${payment.externalRef}:${amount}:${Date.now()}`,
    payload: { amount, reason: input.reason },
    status: result.status,
  });

  if (result.status === 'FAILED') {
    throw new AppError('PAYMENT_FAILED', result.message ?? 'The refund was rejected by the provider.');
  }

  const refundedTotal = payment.refundedAmount + result.refundedAmount;
  const fullyRefunded = refundedTotal >= (payment.chargedAmount ?? payment.amount);

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      refundedAmount: refundedTotal,
      status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
    },
  });

  await prisma.order.update({
    where: { id: payment.orderId },
    data: {
      refundedTotal: { increment: result.refundedAmount },
      paymentStatus: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      ...(fullyRefunded ? { status: 'REFUNDED' } : {}),
    },
  });

  await prisma.orderEvent.create({
    data: {
      orderId: payment.orderId,
      type: 'REFUNDED',
      message: `Refund of ${result.refundedAmount} issued via ${provider.descriptor.displayName}.${input.reason ? ` Reason: ${input.reason}` : ''}`,
      actorId: input.actorId ?? null,
      visibleToCustomer: true,
    },
  });

  return { status: result.status, refundedAmount: result.refundedAmount };
}

/** Customer-facing status poll used by the checkout waiting screen. */
export async function pollPaymentStatus(externalRef: string) {
  const payment = await prisma.payment.findUnique({
    where: { externalRef },
    include: { order: { select: { orderNumber: true, paymentStatus: true, status: true } } },
  });
  if (!payment) throw new AppError('NOT_FOUND', 'Payment not found.');

  if (!TERMINAL_PAYMENT_STATUSES.includes(payment.status as PaymentStatus)) {
    await verifyAndSettle(payment.id).catch((error) => {
      logger.warn('payment.poll_failed', { externalRef, error: String(error) });
    });
  }

  const fresh = await prisma.payment.findUnique({
    where: { externalRef },
    include: { order: { select: { orderNumber: true, paymentStatus: true, status: true } } },
  });

  return {
    status: fresh!.status as PaymentStatus,
    orderNumber: fresh!.order.orderNumber,
    orderStatus: fresh!.order.status,
    failureMessage: fresh!.failureMessage,
    expiresAt: fresh!.expiresAt,
  };
}
