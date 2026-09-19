import { AppError } from '@/lib/errors';
import { redact } from '@/lib/json';
import { providerFetch } from '../http';
import { verifyTimestampedSignature, webhookEventKey } from '../signature';
import type {
  InitiatePaymentInput,
  InitiatePaymentResult,
  PaymentProvider,
  PaymentStatusResult,
  ProviderDescriptor,
  RawWebhook,
  RefundInput,
  RefundResult,
  VerificationInput,
  VerificationResult,
  WebhookParseResult,
} from '../types';

/**
 * Card payments — hosted checkout adapter.
 *
 * PCI POSTURE
 * -----------
 * No card data reaches this application. We create a hosted payment session
 * on the processor and redirect the customer to it; the processor collects and
 * tokenises the card. We store only the brand and last four digits, which the
 * processor returns after capture. There is no code path in this repository
 * that can accept a PAN, a CVV or an expiry date, and none should be added.
 *
 * The adapter is written against a Stripe-compatible hosted-session API
 * (POST /v1/checkout/sessions, GET /v1/checkout/sessions/{id}, POST /v1/refunds,
 * `Stripe-Signature: t=…,v1=…` webhooks). Point CARD_API_BASE at your processor
 * if it exposes the same shape; otherwise implement this same interface in a
 * sibling file and register it — nothing else in the app changes.
 */

const PROVIDER_ID = 'card';

interface CardConfig {
  driver: string;
  apiBase: string;
  secret: string;
  webhookSecret: string;
  currency: string;
}

function readConfig(): CardConfig {
  return {
    driver: process.env.CARD_PROVIDER ?? 'stripe',
    apiBase: (process.env.CARD_API_BASE ?? 'https://api.stripe.com').replace(/\/$/, ''),
    secret: process.env.CARD_PROCESSOR_SECRET ?? '',
    webhookSecret: process.env.CARD_WEBHOOK_SECRET ?? '',
    currency: process.env.CARD_CURRENCY ?? 'AED',
  };
}

function mapSessionStatus(session: {
  payment_status?: string;
  status?: string;
}): PaymentStatusResult['status'] {
  if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') return 'SUCCESSFUL';
  if (session.status === 'expired') return 'EXPIRED';
  if (session.status === 'complete') return 'SUCCESSFUL';
  if (session.status === 'open') return 'PROCESSING';
  return 'PROCESSING';
}

export function createCardProvider(): PaymentProvider {
  const config = readConfig();
  const missing: string[] = [];
  if (!config.secret) missing.push('CARD_PROCESSOR_SECRET');
  const environment: 'sandbox' | 'live' =
    config.secret.startsWith('sk_live') || process.env.PAYMENTS_ENVIRONMENT === 'live' ? 'live' : 'sandbox';

  const descriptor: ProviderDescriptor = {
    id: PROVIDER_ID,
    kind: 'CARD',
    displayName: 'Credit or debit card',
    blurb: 'Visa, Mastercard and American Express. Handled by our payment processor.',
    settlementCurrencies: [config.currency],
    capabilities: {
      asynchronousApproval: false,
      redirect: true,
      refunds: true,
      partialRefunds: true,
      statusPolling: true,
      webhooks: true,
    },
    configured: missing.length === 0,
    configurationHint:
      missing.length > 0
        ? `Add ${missing.join(', ')} to your environment, then restart. See docs/PAYMENTS.md.`
        : !config.webhookSecret
          ? 'CARD_WEBHOOK_SECRET is not set — webhook callbacks will be rejected.'
          : undefined,
    environment,
    requiredFields: [],
  };

  function assertConfigured() {
    if (!descriptor.configured) {
      throw new AppError('PROVIDER_NOT_CONFIGURED', 'Card payment is not activated for this store.', {
        internal: { missing },
      });
    }
    if (environment === 'live' && config.secret.startsWith('sk_test')) {
      throw new AppError('PROVIDER_NOT_CONFIGURED', 'Card payment is misconfigured.', {
        internal: { reason: 'test key in live mode' },
      });
    }
  }

  function authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${config.secret}` };
  }

  return {
    descriptor,

    validateFields() {
      // Nothing is collected here by design — the processor's hosted page does it.
      return {};
    },

    async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
      assertConfigured();

      const response = await providerFetch<{
        id?: string;
        url?: string;
        status?: string;
        payment_status?: string;
        error?: { message?: string };
      }>({
        provider: PROVIDER_ID,
        method: 'POST',
        url: `${config.apiBase}/v1/checkout/sessions`,
        headers: { ...authHeaders(), 'Idempotency-Key': input.externalRef },
        encoding: 'form',
        body: {
          mode: 'payment',
          success_url: `${input.returnUrl}?ref=${input.externalRef}`,
          cancel_url: input.cancelUrl,
          client_reference_id: input.externalRef,
          customer_email: input.customer.email,
          'metadata[order_id]': input.orderId,
          'metadata[order_number]': input.orderNumber,
          'metadata[external_ref]': input.externalRef,
          'line_items[0][quantity]': 1,
          'line_items[0][price_data][currency]': input.settlementCurrency.toLowerCase(),
          // Processor expects minor units — which is exactly how we store money.
          'line_items[0][price_data][unit_amount]': input.chargeAmount,
          'line_items[0][price_data][product_data][name]': `Order ${input.orderNumber}`,
          'line_items[0][price_data][product_data][description]': input.description.slice(0, 200),
        },
      });

      if (!response.ok || !response.data?.url) {
        throw new AppError('PAYMENT_FAILED', 'We could not open the card payment page. Please try again.', {
          internal: { status: response.status, body: redact(response.data) },
        });
      }

      return {
        status: 'PROCESSING',
        providerRef: response.data.id,
        redirectUrl: response.data.url,
        instruction: 'You will be taken to our payment processor to complete the payment securely.',
        expiresInSeconds: 30 * 60,
        metadata: { sessionId: response.data.id },
      };
    },

    async checkPaymentStatus(externalRef: string, providerRef?: string | null): Promise<PaymentStatusResult> {
      assertConfigured();
      if (!providerRef) {
        return { status: 'PENDING', failureCode: 'no_session', failureMessage: 'No payment session yet.' };
      }
      const response = await providerFetch<{
        id?: string;
        status?: string;
        payment_status?: string;
        amount_total?: number;
        currency?: string;
        payment_intent?: string | { id?: string; charges?: unknown };
      }>({
        provider: PROVIDER_ID,
        method: 'GET',
        url: `${config.apiBase}/v1/checkout/sessions/${encodeURIComponent(providerRef)}`,
        headers: authHeaders(),
        retries: 1,
      });

      const session = response.data ?? {};
      const intentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

      return {
        status: mapSessionStatus(session),
        providerRef: intentId ?? session.id ?? providerRef,
        capturedAmount: session.amount_total,
        capturedCurrency: session.currency?.toUpperCase(),
        metadata: { sessionId: session.id, paymentIntent: intentId },
        raw: redact(session),
      };
    },

    async verifyPayment(input: VerificationInput): Promise<VerificationResult> {
      const status = await this.checkPaymentStatus(input.externalRef, input.providerRef);
      if (status.status !== 'SUCCESSFUL') return { ...status, verified: false };
      if (status.capturedCurrency && status.capturedCurrency !== input.expectedCurrency) {
        return { ...status, verified: false, mismatchReason: 'currency_mismatch' };
      }
      if (typeof status.capturedAmount === 'number' && status.capturedAmount !== input.expectedAmount) {
        return { ...status, verified: false, mismatchReason: 'amount_mismatch' };
      }
      return { ...status, verified: true };
    },

    async refundPayment(input: RefundInput): Promise<RefundResult> {
      assertConfigured();
      const response = await providerFetch<{ id?: string; amount?: number; status?: string }>({
        provider: PROVIDER_ID,
        method: 'POST',
        url: `${config.apiBase}/v1/refunds`,
        headers: { ...authHeaders(), 'Idempotency-Key': `refund-${input.externalRef}-${input.amount ?? 'full'}` },
        encoding: 'form',
        body: {
          payment_intent: input.providerRef,
          ...(input.amount ? { amount: input.amount } : {}),
          ...(input.reason ? { 'metadata[reason]': input.reason } : {}),
        },
      });

      if (!response.ok) {
        return { status: 'FAILED', refundedAmount: 0, message: 'The processor rejected the refund.' };
      }
      const refunded = response.data?.amount ?? input.amount ?? 0;
      return {
        status: input.amount && refunded < input.amount ? 'PARTIALLY_REFUNDED' : 'REFUNDED',
        providerRefundRef: response.data?.id,
        refundedAmount: refunded,
      };
    },

    async handleWebhook(raw: RawWebhook): Promise<WebhookParseResult> {
      const verification = verifyTimestampedSignature({
        header: raw.headers.get('stripe-signature') ?? raw.headers.get('x-signature'),
        rawBody: raw.rawBody,
        secret: config.webhookSecret,
      });

      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(raw.rawBody) as Record<string, unknown>;
      } catch {
        return {
          signatureValid: false,
          eventId: webhookEventKey(PROVIDER_ID, `malformed-${Date.now()}`),
          eventType: 'malformed',
          payload: {},
          message: 'Body was not valid JSON.',
        };
      }

      const object = ((body.data as Record<string, unknown>)?.object ?? {}) as Record<string, unknown>;
      const eventType = String(body.type ?? 'unknown');
      const details = (object.payment_method_details ?? {}) as Record<string, unknown>;
      const card = (details.card ?? {}) as Record<string, unknown>;

      let status: PaymentStatusResult['status'] | undefined;
      if (eventType === 'checkout.session.completed' || eventType === 'payment_intent.succeeded') {
        status = 'SUCCESSFUL';
      } else if (eventType === 'checkout.session.expired') {
        status = 'EXPIRED';
      } else if (eventType === 'payment_intent.payment_failed') {
        status = 'FAILED';
      } else if (eventType.startsWith('charge.refunded')) {
        status = 'REFUNDED';
      }

      const metadata = (object.metadata ?? {}) as Record<string, unknown>;

      return {
        signatureValid: verification.valid,
        eventId: webhookEventKey(PROVIDER_ID, String(body.id ?? `${eventType}-${Date.now()}`)),
        eventType,
        externalRef: (metadata.external_ref as string) ?? (object.client_reference_id as string),
        providerRef:
          (typeof object.payment_intent === 'string' ? object.payment_intent : undefined) ??
          (object.id as string),
        status,
        amount: (object.amount_total as number) ?? (object.amount as number),
        currency: (object.currency as string)?.toUpperCase(),
        cardBrand: card.brand as string,
        cardLast4: card.last4 as string,
        failureMessage: (object.last_payment_error as { message?: string })?.message,
        payload: redact(body),
        message: verification.reason,
      };
    },
  };
}
