import { publicEncrypt, constants as cryptoConstants } from 'node:crypto';
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
 * Airtel Money — Collections (merchant payments) adapter.
 *
 * INTEGRATION NOTES FOR THE MERCHANT
 * ----------------------------------
 * 1. Register at https://developers.airtel.africa, create an application and
 *    request the Collection product for your country.
 * 2. Put the credentials in AIRTEL_CLIENT_ID / AIRTEL_CLIENT_SECRET and set
 *    AIRTEL_COUNTRY (ISO-2) and AIRTEL_CURRENCY.
 * 3. Production accounts are issued an RSA public key used to encrypt
 *    sensitive payload fields. Supply it (base64 DER or PEM) in
 *    AIRTEL_PUBLIC_KEY; the adapter then sends the `x-key` header. Without it
 *    the adapter runs unencrypted, which UAT accepts and production does not.
 * 4. Register the callback URL with Airtel:
 *       {APP_URL}/api/payments/webhook/airtel_money
 *    and set AIRTEL_WEBHOOK_SECRET to the shared secret they issue.
 *
 * Endpoint shapes follow Airtel's published Collection spec. Verify against
 * the current documentation for your market before going live.
 */

const PROVIDER_ID = 'airtel_money';

interface AirtelConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  country: string;
  currency: string;
  publicKey: string;
  webhookSecret: string;
}

function readConfig(): AirtelConfig {
  return {
    baseUrl: (process.env.AIRTEL_BASE_URL ?? 'https://openapiuat.airtel.africa').replace(/\/$/, ''),
    clientId: process.env.AIRTEL_CLIENT_ID ?? '',
    clientSecret: process.env.AIRTEL_CLIENT_SECRET ?? '',
    country: process.env.AIRTEL_COUNTRY ?? 'RW',
    currency: process.env.AIRTEL_CURRENCY ?? 'RWF',
    publicKey: process.env.AIRTEL_PUBLIC_KEY ?? '',
    webhookSecret: process.env.AIRTEL_WEBHOOK_SECRET ?? '',
  };
}

function isUat(baseUrl: string) {
  return /uat/i.test(baseUrl);
}

/** Airtel expects a national subscriber number without the country code. */
export function normaliseSubscriber(input: string, country: string): string {
  const digits = input.replace(/[^\d]/g, '');
  if (digits.length < 8) throw new AppError('VALIDATION_ERROR', 'Enter a valid mobile number.');
  const codes: Record<string, string> = { RW: '250', UG: '256', KE: '254', TZ: '255', ZM: '260', NG: '234' };
  const cc = codes[country.toUpperCase()];
  let local = digits;
  if (cc && local.startsWith(cc)) local = local.slice(cc.length);
  return local.replace(/^0+/, '');
}

/**
 * Airtel's production integration encrypts the payload key with the RSA public
 * key issued to the merchant. Returns null when no key is configured.
 */
function encryptWithPublicKey(payload: string, publicKeyRaw: string): string | null {
  if (!publicKeyRaw) return null;
  const pem = publicKeyRaw.includes('BEGIN')
    ? publicKeyRaw.replace(/\\n/g, '\n')
    : `-----BEGIN PUBLIC KEY-----\n${publicKeyRaw.replace(/\s+/g, '').replace(/(.{64})/g, '$1\n')}\n-----END PUBLIC KEY-----\n`;
  try {
    return publicEncrypt(
      { key: pem, padding: cryptoConstants.RSA_PKCS1_PADDING },
      Buffer.from(payload, 'utf8'),
    ).toString('base64');
  } catch {
    // A malformed key must not silently downgrade to plaintext in live mode.
    throw new AppError('PROVIDER_NOT_CONFIGURED', 'Airtel encryption key is invalid.');
  }
}

/** Airtel transaction codes → our vocabulary. */
function mapStatus(code?: string, resultCode?: string): PaymentStatusResult['status'] {
  const value = (code ?? '').toUpperCase();
  switch (value) {
    case 'TS':
    case 'SUCCESS':
    case 'SUCCESSFUL':
      return 'SUCCESSFUL';
    case 'TF':
    case 'FAILED':
      return 'FAILED';
    case 'TA':
    case 'TIP':
    case 'IN_PROCESS':
    case 'PENDING':
      return 'PROCESSING';
    case 'TE':
    case 'EXPIRED':
      return 'EXPIRED';
    case 'TC':
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return resultCode === 'ESB000010' ? 'FAILED' : 'PROCESSING';
  }
}

export function createAirtelProvider(): PaymentProvider {
  const config = readConfig();
  const missing: string[] = [];
  if (!config.clientId) missing.push('AIRTEL_CLIENT_ID');
  if (!config.clientSecret) missing.push('AIRTEL_CLIENT_SECRET');
  const environment: 'sandbox' | 'live' = isUat(config.baseUrl) ? 'sandbox' : 'live';

  const descriptor: ProviderDescriptor = {
    id: PROVIDER_ID,
    kind: 'MOBILE_MONEY',
    displayName: 'Airtel Money',
    blurb: 'Confirm with your Airtel Money PIN on your handset.',
    settlementCurrencies: [config.currency],
    capabilities: {
      asynchronousApproval: true,
      redirect: false,
      refunds: true,
      partialRefunds: false,
      statusPolling: true,
      webhooks: true,
    },
    configured: missing.length === 0,
    configurationHint:
      missing.length > 0
        ? `Add ${missing.join(', ')} to your environment, then restart. See docs/PAYMENTS.md.`
        : environment === 'live' && !config.publicKey
          ? 'Live mode without AIRTEL_PUBLIC_KEY — Airtel production requires payload encryption.'
          : undefined,
    environment,
    requiredFields: [
      {
        name: 'msisdn',
        label: 'Airtel mobile number',
        type: 'tel',
        placeholder: '073 123 4567',
        pattern: '^[0-9 +()-]{8,20}$',
      },
    ],
  };

  function assertConfigured() {
    if (!descriptor.configured) {
      throw new AppError('PROVIDER_NOT_CONFIGURED', 'Airtel Money is not activated for this store.', {
        internal: { missing },
      });
    }
  }

  async function token(): Promise<string> {
    return cachedToken(`${PROVIDER_ID}:${config.country}`, 3000, async () => {
      const response = await providerFetch<{ access_token?: string; expires_in?: string }>({
        provider: PROVIDER_ID,
        method: 'POST',
        url: `${config.baseUrl}/auth/oauth2/token`,
        headers: { Accept: '*/*' },
        body: {
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'client_credentials',
        },
      });
      if (!response.ok || !response.data?.access_token) {
        throw new AppError('PROVIDER_UNAVAILABLE', 'Airtel Money is temporarily unavailable.', {
          internal: { status: response.status },
        });
      }
      return response.data.access_token;
    });
  }

  function baseHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'X-Country': config.country,
      'X-Currency': config.currency,
      Accept: '*/*',
    };
  }

  return {
    descriptor,

    validateFields(fields) {
      return { msisdn: normaliseSubscriber(fields.msisdn ?? '', config.country) };
    },

    async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
      assertConfigured();
      const accessToken = await token();
      const msisdn = normaliseSubscriber(input.fields.msisdn ?? input.customer.phone ?? '', config.country);
      const amountMajor = toMajor(input.chargeAmount, config.currency === 'RWF' ? 0 : 2);

      const headers = baseHeaders(accessToken);
      const encrypted = encryptWithPublicKey(msisdn, config.publicKey);
      if (encrypted) headers['x-key'] = encrypted;

      const response = await providerFetch<{
        data?: { transaction?: { id?: string; status?: string } };
        status?: { code?: string; message?: string; result_code?: string; success?: boolean };
      }>({
        provider: PROVIDER_ID,
        method: 'POST',
        url: `${config.baseUrl}/merchant/v1/payments/`,
        headers,
        body: {
          reference: input.orderNumber,
          subscriber: { country: config.country, currency: config.currency, msisdn },
          transaction: {
            amount: amountMajor,
            country: config.country,
            currency: config.currency,
            id: input.externalRef,
          },
        },
      });

      const status = response.data?.status;
      if (!response.ok || status?.success === false) {
        throw new AppError('PAYMENT_FAILED', status?.message ?? 'Airtel could not start this payment.', {
          internal: { status: response.status, body: redact(response.data) },
        });
      }

      return {
        status: mapStatus(response.data?.data?.transaction?.status, status?.result_code),
        providerRef: response.data?.data?.transaction?.id ?? input.externalRef,
        instruction: `Enter your Airtel Money PIN on ${maskPhone(msisdn)} to approve this payment.`,
        expiresInSeconds: Number(process.env.PAYMENT_EXPIRY_MINUTES ?? 15) * 60,
        metadata: { msisdn: maskPhone(msisdn), country: config.country },
      };
    },

    async checkPaymentStatus(externalRef: string): Promise<PaymentStatusResult> {
      assertConfigured();
      const accessToken = await token();
      const response = await providerFetch<{
        data?: {
          transaction?: {
            id?: string;
            message?: string;
            status?: string;
            airtel_money_id?: string;
            amount?: number;
          };
        };
        status?: { code?: string; message?: string; result_code?: string; success?: boolean };
      }>({
        provider: PROVIDER_ID,
        method: 'GET',
        url: `${config.baseUrl}/standard/v1/payments/${encodeURIComponent(externalRef)}`,
        headers: baseHeaders(accessToken),
        retries: 1,
      });

      const tx = response.data?.data?.transaction;
      const precision = config.currency === 'RWF' ? 0 : 2;
      const mapped = mapStatus(tx?.status, response.data?.status?.result_code);

      return {
        status: mapped,
        providerRef: tx?.airtel_money_id ?? tx?.id ?? externalRef,
        capturedAmount: typeof tx?.amount === 'number' ? Math.round(tx.amount * 10 ** precision) : undefined,
        capturedCurrency: config.currency,
        failureCode: mapped === 'FAILED' ? (response.data?.status?.result_code ?? tx?.status) : undefined,
        failureMessage: mapped === 'FAILED' ? (tx?.message ?? response.data?.status?.message) : undefined,
        raw: redact(response.data),
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
      const accessToken = await token();
      const response = await providerFetch<{
        data?: { transaction?: { airtel_money_id?: string; status?: string } };
        status?: { success?: boolean; message?: string };
      }>({
        provider: PROVIDER_ID,
        method: 'POST',
        url: `${config.baseUrl}/standard/v1/payments/refund`,
        headers: baseHeaders(accessToken),
        body: { transaction: { airtel_money_id: input.providerRef } },
      });

      const success = response.ok && response.data?.status?.success !== false;
      return {
        status: success ? 'REFUNDED' : 'FAILED',
        providerRefundRef: response.data?.data?.transaction?.airtel_money_id,
        refundedAmount: success ? (input.amount ?? 0) : 0,
        message: response.data?.status?.message,
      };
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

      let signatureValid = true;
      let reason: string | undefined;
      if (config.webhookSecret) {
        const result = verifyBodySignature({
          header: raw.headers.get('x-auth-token') ?? raw.headers.get('x-signature'),
          rawBody: raw.rawBody,
          secret: config.webhookSecret,
          encoding: 'base64',
        });
        signatureValid = result.valid;
        reason = result.reason;
      } else if (environment === 'live') {
        signatureValid = false;
        reason = 'no_webhook_secret_in_live_mode';
      }

      const tx = (body.transaction ?? {}) as Record<string, unknown>;
      const precision = config.currency === 'RWF' ? 0 : 2;

      return {
        signatureValid,
        eventId: webhookEventKey(
          PROVIDER_ID,
          `${String(tx.id ?? 'unknown')}:${String(tx.status_code ?? tx.status ?? 'unknown')}`,
        ),
        eventType: `payment.${String(tx.status_code ?? tx.status ?? 'unknown').toLowerCase()}`,
        externalRef: tx.id as string,
        providerRef: (tx.airtel_money_id as string) ?? (tx.id as string),
        status: mapStatus((tx.status_code as string) ?? (tx.status as string)),
        amount: tx.amount ? Math.round(Number(tx.amount) * 10 ** precision) : undefined,
        currency: config.currency,
        failureMessage: tx.message as string,
        payload: redact(body),
        message: reason,
      };
    },
  };
}
