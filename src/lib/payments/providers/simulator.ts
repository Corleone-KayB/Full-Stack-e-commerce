import { AppError } from '@/lib/errors';
import { maskPhone } from '@/lib/utils';
import { hmacHex, webhookEventKey } from '../signature';
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
 * Sandbox simulator.
 *
 * Exists so the whole purchase journey — including the asynchronous
 * handset-approval states, timeouts, failures and webhook idempotency — can be
 * exercised end to end with no provider credentials. It is refused outright
 * when PAYMENTS_ENVIRONMENT is "live".
 *
 * Behaviour is driven by the last digit of the phone number entered:
 *   …0  immediate success
 *   …1  approved after ~6 seconds (the realistic case)
 *   …2  declined by the customer
 *   …3  insufficient funds
 *   …4  never confirmed — expires
 * anything else: approved after ~6 seconds.
 */

const PROVIDER_ID = 'simulator';

interface SimState {
  externalRef: string;
  status: PaymentStatusResult['status'];
  resolveAt: number;
  outcome: 'SUCCESSFUL' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  amount: number;
  currency: string;
  failureCode?: string;
  failureMessage?: string;
  payerMasked?: string;
}

const memory = new Map<string, SimState>();

function outcomeFor(msisdn: string): { outcome: SimState['outcome']; delayMs: number; code?: string; message?: string } {
  const last = msisdn.trim().slice(-1);
  switch (last) {
    case '0':
      return { outcome: 'SUCCESSFUL', delayMs: 0 };
    case '2':
      return { outcome: 'CANCELLED', delayMs: 5000, code: 'PAYER_REJECTED', message: 'You declined the request on your handset.' };
    case '3':
      return { outcome: 'FAILED', delayMs: 5000, code: 'INSUFFICIENT_FUNDS', message: 'There were not enough funds in the wallet.' };
    case '4':
      return { outcome: 'EXPIRED', delayMs: 1000 * 60 * 60, code: 'TIMEOUT', message: 'No response from the handset.' };
    default:
      return { outcome: 'SUCCESSFUL', delayMs: 6000 };
  }
}

export function createSimulatorProvider(): PaymentProvider {
  const live = process.env.PAYMENTS_ENVIRONMENT === 'live';

  const descriptor: ProviderDescriptor = {
    id: PROVIDER_ID,
    kind: 'TEST',
    displayName: 'Sandbox wallet (test)',
    blurb: 'Demo payments only — no money moves. Disabled automatically in live mode.',
    settlementCurrencies: ['AED', 'RWF', 'USD'],
    capabilities: {
      asynchronousApproval: true,
      redirect: false,
      refunds: true,
      partialRefunds: true,
      statusPolling: true,
      webhooks: true,
    },
    configured: !live,
    configurationHint: live ? 'The simulator is disabled because PAYMENTS_ENVIRONMENT is "live".' : undefined,
    environment: 'sandbox',
    requiredFields: [
      {
        name: 'msisdn',
        label: 'Test mobile number',
        type: 'tel',
        placeholder: '0781234561',
        pattern: '^[0-9 +()-]{6,20}$',
      },
    ],
  };

  function read(ref: string): SimState | undefined {
    const state = memory.get(ref);
    if (!state) return undefined;
    if (state.status === 'PROCESSING' && Date.now() >= state.resolveAt) {
      state.status = state.outcome;
    }
    return state;
  }

  return {
    descriptor,

    validateFields(fields) {
      const msisdn = (fields.msisdn ?? '').replace(/[^\d]/g, '');
      if (msisdn.length < 6) throw new AppError('VALIDATION_ERROR', 'Enter a test mobile number.');
      return { msisdn };
    },

    async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
      if (live) throw new AppError('PROVIDER_NOT_CONFIGURED', 'Test payments are disabled in live mode.');
      const msisdn = input.fields.msisdn ?? '0000000001';
      const plan = outcomeFor(msisdn);
      const state: SimState = {
        externalRef: input.externalRef,
        status: plan.delayMs === 0 ? plan.outcome : 'PROCESSING',
        resolveAt: Date.now() + plan.delayMs,
        outcome: plan.outcome,
        amount: input.chargeAmount,
        currency: input.settlementCurrency,
        failureCode: plan.code,
        failureMessage: plan.message,
        payerMasked: maskPhone(msisdn),
      };
      memory.set(input.externalRef, state);
      return {
        status: state.status,
        providerRef: `SIM-${input.externalRef.slice(0, 8).toUpperCase()}`,
        instruction: `Simulated request sent to ${maskPhone(msisdn)}. This is a sandbox payment — no money moves.`,
        expiresInSeconds: 15 * 60,
        metadata: { simulated: true, scenario: plan.outcome },
      };
    },

    async checkPaymentStatus(externalRef: string): Promise<PaymentStatusResult> {
      const state = read(externalRef);
      if (!state) return { status: 'FAILED', failureCode: 'not_found', failureMessage: 'Unknown reference.' };
      return {
        status: state.status,
        providerRef: `SIM-${externalRef.slice(0, 8).toUpperCase()}`,
        capturedAmount: state.status === 'SUCCESSFUL' ? state.amount : undefined,
        capturedCurrency: state.currency,
        failureCode: state.status === 'SUCCESSFUL' ? undefined : state.failureCode,
        failureMessage: state.status === 'SUCCESSFUL' ? undefined : state.failureMessage,
        payerMasked: state.payerMasked,
      };
    },

    async verifyPayment(input: VerificationInput): Promise<VerificationResult> {
      const status = await this.checkPaymentStatus(input.externalRef);
      if (status.status !== 'SUCCESSFUL') return { ...status, verified: false };
      if (status.capturedAmount !== input.expectedAmount) {
        return { ...status, verified: false, mismatchReason: 'amount_mismatch' };
      }
      return { ...status, verified: true };
    },

    async refundPayment(input: RefundInput): Promise<RefundResult> {
      const state = memory.get(input.externalRef);
      const amount = input.amount ?? state?.amount ?? 0;
      return {
        status: state && input.amount && input.amount < state.amount ? 'PARTIALLY_REFUNDED' : 'REFUNDED',
        providerRefundRef: `SIMREF-${Date.now().toString(36).toUpperCase()}`,
        refundedAmount: amount,
      };
    },

    async handleWebhook(raw: RawWebhook): Promise<WebhookParseResult> {
      const body = JSON.parse(raw.rawBody || '{}') as Record<string, unknown>;
      const secret = process.env.AUTH_SECRET ?? 'dev';
      const expected = hmacHex(secret, raw.rawBody);
      const provided = raw.headers.get('x-sim-signature') ?? '';
      return {
        signatureValid: provided === expected,
        eventId: webhookEventKey(PROVIDER_ID, String(body.eventId ?? Date.now())),
        eventType: String(body.type ?? 'simulated'),
        externalRef: body.externalRef as string,
        providerRef: body.providerRef as string,
        status: body.status as PaymentStatusResult['status'],
        amount: body.amount as number,
        currency: body.currency as string,
        payload: body,
      };
    },
  };
}

/** Test seam — clears simulated transactions between test runs. */
export function __resetSimulator() {
  memory.clear();
}
