import { AppError } from '@/lib/errors';
import { maskPhone } from '@/lib/utils';
import { toMajor } from '@/lib/money';
import { redact } from '@/lib/json';
import { cachedToken, providerFetch } from '../http';
import { verifyBodySignature, webhookEventKey } from '../signature';
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
 * MTN Mobile Money — Collections API adapter.
 *
 * INTEGRATION NOTES FOR THE MERCHANT
 * ----------------------------------
 * 1. Create an account at https://momodeveloper.mtn.com and subscribe to the
 *    **Collections** product. Copy the primary key into MTN_SUBSCRIPTION_KEY.
 * 2. Create an API user + API key for your callback host (the sandbox
 *    provisioning endpoints do this; production credentials are issued by your
 *    MTN country team). Put them in MTN_API_USER / MTN_API_KEY.
 * 3. Set MTN_TARGET_ENVIRONMENT ("sandbox", or your production target such as
 *    "mtnrwanda") and MTN_CURRENCY (sandbox only settles EUR).
 * 4. Register the callback URL below with MTN:
 *       {APP_URL}/api/payments/webhook/mtn_momo
 *
 * The request/response shapes below follow MTN's published Collections spec.
 * Confirm them against the current documentation for your market before going
 * live — this adapter deliberately invents no endpoints of its own.
 */

const PROVIDER_ID = 'mtn_momo';

interface MtnConfig {
  baseUrl: string;
  subscriptionKey: string;
  apiUser: string;
  apiKey: string;
  targetEnvironment: string;
  currency: string;
  webhookSecret: string;
}

function readConfig(): MtnConfig {
  return {
    baseUrl: (process.env.MTN_BASE_URL ?? 'https://sandbox.momodeveloper.mtn.com').replace(/\/$/, ''),
    subscriptionKey: process.env.MTN_SUBSCRIPTION_KEY ?? '',
    apiUser: process.env.MTN_API_USER ?? '',
    apiKey: process.env.MTN_API_KEY ?? '',
    targetEnvironment: process.env.MTN_TARGET_ENVIRONMENT ?? 'sandbox',
    currency: process.env.MTN_CURRENCY ?? 'EUR',
    webhookSecret: process.env.MTN_WEBHOOK_SECRET ?? '',
  };
}

function missingConfig(config: MtnConfig): string[] {
  const missing: string[] = [];
  if (!config.subscriptionKey) missing.push('MTN_SUBSCRIPTION_KEY');
  if (!config.apiUser) missing.push('MTN_API_USER');
  if (!config.apiKey) missing.push('MTN_API_KEY');
  return missing;
}

/** MTN expects a bare MSISDN: country code, no plus, no spaces. */
export function normaliseMsisdn(input: string): string {
  const digits = input.replace(/[^\d]/g, '');
  if (digits.length < 9) throw new AppError('VALIDATION_ERROR', 'Enter a valid mobile number.');
  return digits.replace(/^0+/, '');
}

async function accessToken(config: MtnConfig): Promise<string> {
  return cachedToken(`${PROVIDER_ID}:${config.targetEnvironment}`, 3000, async () => {
    const basic = Buffer.from(`${config.apiUser}:${config.apiKey}`).toString('base64');
    const response = await providerFetch<{ access_token?: string; expires_in?: number }>({
      provider: PROVIDER_ID,
      method: 'POST',
      url: `${config.baseUrl}/collection/token/`,
      headers: {
        Authorization: `Basic ${basic}`,
        'Ocp-Apim-Subscription-Key': config.subscriptionKey,
      },
      body: {},
    });
    if (!response.ok || !response.data?.access_token) {
      throw new AppError('PROVIDER_UNAVAILABLE', 'Mobile money is temporarily unavailable.', {
        internal: { provider: PROVIDER_ID, status: response.status },
      });
    }
    return response.data.access_token;
  });
}

/** MTN status strings → our payment status vocabulary. */
function mapStatus(raw?: string): PaymentStatusResult['status'] {
  switch ((raw ?? '').toUpperCase()) {
    case 'SUCCESSFUL':
      return 'SUCCESSFUL';
    case 'FAILED':
      return 'FAILED';
    case 'REJECTED':
      return 'CANCELLED';
    case 'TIMEOUT':
      return 'EXPIRED';
    case 'PENDING':
    case 'ONGOING':
      return 'PROCESSING';
    default:
      return 'PROCESSING';
  }
}

export function createMtnProvider(): PaymentProvider {
  const config = readConfig();
  const missing = missingConfig(config);
  const environment = config.targetEnvironment === 'sandbox' ? 'sandbox' : 'live';

  const descriptor: ProviderDescriptor = {
    id: PROVIDER_ID,
    kind: 'MOBILE_MONEY',
    displayName: 'MTN Mobile Money',
    blurb: 'Approve the payment prompt on your handset.',
    settlementCurrencies: [config.currency],
    capabilities: {
      asynchronousApproval: true,
      redirect: false,
      // Collections cannot refund. Refunds are issued through the separate
      // Disbursements product; see refundPayment below.
      refunds: false,
      partialRefunds: false,
      statusPolling: true,
      webhooks: true,
    },
    configured: missing.length === 0,
    configurationHint:
      missing.length > 0
        ? `Add ${missing.join(', ')} to your environment, then restart. See docs/PAYMENTS.md.`
        : undefined,
    environment,
    requiredFields: [
      {
        name: 'msisdn',
        label: 'MTN mobile number',
        type: 'tel',
        placeholder: '078 123 4567',
        pattern: '^[0-9 +()-]{9,20}$',
      },
    ],
  };

  function assertConfigured() {
    if (!descriptor.configured) {
      throw new AppError('PROVIDER_NOT_CONFIGURED', 'MTN Mobile Money is not activated for this store.', {
        internal: { missing },
      });
    }
  }

  return {
    descriptor,

    validateFields(fields) {
      const msisdn = normaliseMsisdn(fields.msisdn ?? '');
      return { msisdn };
    },

    async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
      assertConfigured();
      const token = await accessToken(config);
      const msisdn = normaliseMsisdn(input.fields.msisdn ?? input.customer.phone ?? '');

      // MTN takes the amount in MAJOR units as a string.
      const amountMajor = toMajor(input.chargeAmount, input.settlementCurrency === 'RWF' ? 0 : 2);

      const response = await providerFetch({
        provider: PROVIDER_ID,
        method: 'POST',
        url: `${config.baseUrl}/collection/v1_0/requesttopay`,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Reference-Id': input.externalRef,
          'X-Target-Environment': config.targetEnvironment,
          'Ocp-Apim-Subscription-Key': config.subscriptionKey,
          'X-Callback-Url': input.callbackUrl,
        },
        body: {
          amount: String(amountMajor),
          currency: input.settlementCurrency,
          externalId: input.orderNumber,
          payer: { partyIdType: 'MSISDN', partyId: msisdn },
          payerMessage: `Order ${input.orderNumber}`,
          payeeNote: input.description.slice(0, 60),
        },
      });

      // 202 Accepted is the documented success response for requesttopay.
      if (response.status !== 202 && !response.ok) {
        throw new AppError('PAYMENT_FAILED', 'MTN could not start this payment. Please try again.', {
          internal: { status: response.status, body: redact(response.data) },
        });
      }

      return {
        status: 'PROCESSING',
        providerRef: input.externalRef, // MTN keys the transaction by our X-Reference-Id
        instruction: `Check ${maskPhone(msisdn)} and approve the MTN payment request.`,
        expiresInSeconds: Number(process.env.PAYMENT_EXPIRY_MINUTES ?? 15) * 60,
        metadata: { msisdn: maskPhone(msisdn), targetEnvironment: config.targetEnvironment },
      };
    },

    async checkPaymentStatus(externalRef: string): Promise<PaymentStatusResult> {
      assertConfigured();
      const token = await accessToken(config);
      const response = await providerFetch<{
        amount?: string;
        currency?: string;
        status?: string;
        reason?: string | { code?: string; message?: string };
        financialTransactionId?: string;
        payer?: { partyId?: string };
      }>({
        provider: PROVIDER_ID,
        method: 'GET',
        url: `${config.baseUrl}/collection/v1_0/requesttopay/${encodeURIComponent(externalRef)}`,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Target-Environment': config.targetEnvironment,
          'Ocp-Apim-Subscription-Key': config.subscriptionKey,
        },
        retries: 1,
      });

      if (response.status === 404) {
        return { status: 'FAILED', failureCode: 'not_found', failureMessage: 'Transaction not found.' };
      }
      const body = response.data ?? {};
      const reason = typeof body.reason === 'string' ? body.reason : body.reason?.code;
      const precision = (body.currency ?? config.currency) === 'RWF' ? 0 : 2;

      return {
        status: mapStatus(body.status),
        providerRef: body.financialTransactionId ?? externalRef,
        capturedAmount: body.amount ? Math.round(Number(body.amount) * 10 ** precision) : undefined,
        capturedCurrency: body.currency,
        failureCode: reason,
        failureMessage:
          typeof body.reason === 'object' ? body.reason?.message : reason ? String(reason) : undefined,
        payerMasked: body.payer?.partyId ? maskPhone(body.payer.partyId) : undefined,
        raw: redact(body),
      };
    },

    async verifyPayment(input: VerificationInput): Promise<VerificationResult> {
      const status = await this.checkPaymentStatus(input.externalRef, input.providerRef);
      if (status.status !== 'SUCCESSFUL') return { ...status, verified: false };

      // Amount and currency must match what we asked for. A provider that
      // reports success for a different amount is a rejection, not a sale.
      if (status.capturedCurrency && status.capturedCurrency !== input.expectedCurrency) {
        return { ...status, verified: false, mismatchReason: 'currency_mismatch' };
      }
      if (typeof status.capturedAmount === 'number' && status.capturedAmount !== input.expectedAmount) {
        return { ...status, verified: false, mismatchReason: 'amount_mismatch' };
      }
      return { ...status, verified: true };
    },

    async refundPayment(_input: RefundInput): Promise<RefundResult> {
      // Honest limitation rather than an invented endpoint: the Collections
      // product has no refund operation. Money is returned via the
      // Disbursements product (transfer), which requires its own subscription
      // key and API user. Wire it up in docs/PAYMENTS.md § "MTN refunds".
      throw new AppError(
        'PROVIDER_NOT_CONFIGURED',
        'MTN refunds are issued through the Disbursements product, which is not connected. Record the refund manually once sent.',
      );
    },

    async handleWebhook(raw: RawWebhook): Promise<WebhookParseResult> {
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

      // MTN's callback carries the transaction body; signing is provisioned
      // per-market. When a shared secret is configured we require it.
      let signatureValid = true;
      let reason: string | undefined;
      if (config.webhookSecret) {
        const result = verifyBodySignature({
          header: raw.headers.get('x-signature') ?? raw.headers.get('x-mtn-signature'),
          rawBody: raw.rawBody,
          secret: config.webhookSecret,
        });
        signatureValid = result.valid;
        reason = result.reason;
      } else if (environment === 'live') {
        // Live traffic with no way to authenticate the caller is refused.
        signatureValid = false;
        reason = 'no_webhook_secret_in_live_mode';
      }

      const externalRef =
        (body.referenceId as string) ?? (body.externalId as string) ?? (body.financialTransactionId as string);
      const currency = (body.currency as string) ?? config.currency;
      const precision = currency === 'RWF' ? 0 : 2;

      return {
        signatureValid,
        eventId: webhookEventKey(
          PROVIDER_ID,
          `${externalRef ?? 'unknown'}:${(body.status as string) ?? 'unknown'}`,
        ),
        eventType: `requesttopay.${String(body.status ?? 'unknown').toLowerCase()}`,
        externalRef,
        providerRef: (body.financialTransactionId as string) ?? externalRef,
        status: mapStatus(body.status as string),
        amount: body.amount ? Math.round(Number(body.amount) * 10 ** precision) : undefined,
        currency,
        failureCode: typeof body.reason === 'string' ? body.reason : undefined,
        payerMasked:
          typeof body.payer === 'object' && body.payer
            ? maskPhone(String((body.payer as { partyId?: string }).partyId ?? ''))
            : undefined,
        payload: redact(body),
        message: reason,
      };
    },
  };
}
