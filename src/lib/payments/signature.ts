import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Webhook signature verification helpers.
 *
 * Rules enforced here, applied by every adapter:
 *   - compare in constant time,
 *   - verify against the raw request bytes, never a re-serialised object,
 *   - reject signatures outside a timestamp tolerance (replay window),
 *   - a missing secret means "cannot verify" — which is a rejection in live
 *     mode and a loud warning in sandbox, never a silent pass.
 */

export const REPLAY_TOLERANCE_SECONDS = 300;

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function hmacHex(secret: string, payload: string, algorithm = 'sha256'): string {
  return createHmac(algorithm, secret).update(payload, 'utf8').digest('hex');
}

export function hmacBase64(secret: string, payload: string, algorithm = 'sha256'): string {
  return createHmac(algorithm, secret).update(payload, 'utf8').digest('base64');
}

/**
 * Verifies a Stripe-style `t=<unix>,v1=<hex>` header.
 * The signed payload is `${timestamp}.${rawBody}`.
 */
export function verifyTimestampedSignature(options: {
  header: string | null;
  rawBody: string;
  secret: string;
  toleranceSeconds?: number;
}): { valid: boolean; reason?: string } {
  const { header, rawBody, secret } = options;
  const tolerance = options.toleranceSeconds ?? REPLAY_TOLERANCE_SECONDS;
  if (!header) return { valid: false, reason: 'missing_signature_header' };
  if (!secret) return { valid: false, reason: 'missing_secret' };

  const parts = Object.fromEntries(
    header
      .split(',')
      .map((chunk) => chunk.trim().split('='))
      .filter((pair) => pair.length === 2) as [string, string][],
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!Number.isFinite(timestamp) || !signature) return { valid: false, reason: 'malformed_signature' };

  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
  if (ageSeconds > tolerance) return { valid: false, reason: 'timestamp_outside_tolerance' };

  const expected = hmacHex(secret, `${timestamp}.${rawBody}`);
  return safeEqual(expected, signature) ? { valid: true } : { valid: false, reason: 'signature_mismatch' };
}

/** Verifies a plain HMAC of the raw body, hex or base64. */
export function verifyBodySignature(options: {
  header: string | null;
  rawBody: string;
  secret: string;
  encoding?: 'hex' | 'base64';
  algorithm?: string;
}): { valid: boolean; reason?: string } {
  const { header, rawBody, secret } = options;
  if (!header) return { valid: false, reason: 'missing_signature_header' };
  if (!secret) return { valid: false, reason: 'missing_secret' };
  const expected =
    options.encoding === 'base64'
      ? hmacBase64(secret, rawBody, options.algorithm)
      : hmacHex(secret, rawBody, options.algorithm);
  const provided = header.replace(/^sha256=/i, '').trim();
  return safeEqual(expected, provided) ? { valid: true } : { valid: false, reason: 'signature_mismatch' };
}

/**
 * Builds the idempotency key stored on PaymentEvent. Uniqueness of this value
 * is what makes duplicate webhook delivery a no-op at the database level.
 */
export function webhookEventKey(provider: string, eventId: string): string {
  return `${provider}:${eventId}`;
}
