import type { PaymentStatus } from '@/types/enums';

/**
 * Payment provider contract.
 *
 * Checkout depends on this interface and nothing else. Adding a provider means
 * writing one adapter and registering it — no change to the order service, the
 * checkout UI, or the webhook plumbing.
 */

export type ProviderId = 'mtn_momo' | 'airtel_money' | 'card' | 'simulator' | (string & {});

export type ProviderKind = 'MOBILE_MONEY' | 'CARD' | 'MANUAL' | 'TEST';

export interface ProviderCapabilities {
  /** Customer approves on their handset; we poll or await a callback. */
  asynchronousApproval: boolean;
  /** Customer is sent to a hosted page. */
  redirect: boolean;
  refunds: boolean;
  partialRefunds: boolean;
  statusPolling: boolean;
  webhooks: boolean;
}

export interface ProviderDescriptor {
  id: ProviderId;
  kind: ProviderKind;
  displayName: string;
  /** One line shown under the option in checkout. */
  blurb: string;
  /** Currencies the provider can settle in. */
  settlementCurrencies: string[];
  capabilities: ProviderCapabilities;
  /** False when required environment variables are missing. */
  configured: boolean;
  /** Why it is not configured — surfaced to admins only. */
  configurationHint?: string;
  environment: 'sandbox' | 'live';
  /** Extra fields the checkout form must collect, e.g. a phone number. */
  requiredFields: { name: string; label: string; type: 'tel' | 'text'; placeholder?: string; pattern?: string }[];
}

export interface InitiatePaymentInput {
  /** Our idempotent reference. Sent to the provider; unique per attempt. */
  externalRef: string;
  orderId: string;
  orderNumber: string;
  /** Amount owed, in minor units of `currency`. */
  amount: number;
  currency: string;
  /** Amount to charge after FX, in minor units of `settlementCurrency`. */
  chargeAmount: number;
  settlementCurrency: string;
  customer: { email: string; name?: string | null; phone?: string | null };
  /** Provider-specific collected fields, already validated. */
  fields: Record<string, string>;
  /** Absolute URLs. */
  callbackUrl: string;
  returnUrl: string;
  cancelUrl: string;
  description: string;
}

export interface InitiatePaymentResult {
  status: PaymentStatus;
  /** Provider's own transaction id, when known at initiation. */
  providerRef?: string;
  /** Where to send the customer, for redirect providers. */
  redirectUrl?: string;
  /** Human instruction for handset-approval flows. */
  instruction?: string;
  /** Seconds after which the attempt should be treated as expired. */
  expiresInSeconds?: number;
  /** Redacted metadata to persist. */
  metadata?: Record<string, unknown>;
  message?: string;
}

export interface PaymentStatusResult {
  status: PaymentStatus;
  providerRef?: string;
  /** Amount the provider says was captured, in settlement minor units. */
  capturedAmount?: number;
  capturedCurrency?: string;
  failureCode?: string;
  failureMessage?: string;
  cardBrand?: string;
  cardLast4?: string;
  payerMasked?: string;
  metadata?: Record<string, unknown>;
  raw?: unknown;
}

export interface VerificationInput {
  externalRef: string;
  providerRef?: string | null;
  expectedAmount: number;
  expectedCurrency: string;
}

export interface VerificationResult extends PaymentStatusResult {
  /** True only when the provider confirms success AND amount+currency match. */
  verified: boolean;
  mismatchReason?: string;
}

export interface RefundInput {
  externalRef: string;
  providerRef: string;
  /** Minor units in the settlement currency. Omit for a full refund. */
  amount?: number;
  currency: string;
  reason?: string;
}

export interface RefundResult {
  status: 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'FAILED' | 'PROCESSING';
  providerRefundRef?: string;
  refundedAmount: number;
  message?: string;
}

export interface RawWebhook {
  /** Exact bytes as received — signature verification must not use a re-serialised body. */
  rawBody: string;
  headers: Headers;
  url: string;
}

export interface WebhookParseResult {
  /** False ⇒ reject with 401 and record the attempt. */
  signatureValid: boolean;
  /** Unique per provider event. Drives idempotency. */
  eventId: string;
  eventType: string;
  /** Our reference, when the provider echoes it. */
  externalRef?: string;
  providerRef?: string;
  status?: PaymentStatus;
  amount?: number;
  currency?: string;
  failureCode?: string;
  failureMessage?: string;
  cardBrand?: string;
  cardLast4?: string;
  payerMasked?: string;
  /** Already redacted. */
  payload: Record<string, unknown>;
  message?: string;
}

export interface PaymentProvider {
  readonly descriptor: ProviderDescriptor;
  /** Validates provider-specific checkout fields; throws AppError on failure. */
  validateFields(fields: Record<string, string>): Record<string, string>;
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  checkPaymentStatus(externalRef: string, providerRef?: string | null): Promise<PaymentStatusResult>;
  verifyPayment(input: VerificationInput): Promise<VerificationResult>;
  refundPayment(input: RefundInput): Promise<RefundResult>;
  handleWebhook(raw: RawWebhook): Promise<WebhookParseResult>;
}
