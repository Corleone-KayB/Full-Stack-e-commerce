import { describe, expect, it } from 'vitest';
import {
  hmacBase64,
  hmacHex,
  REPLAY_TOLERANCE_SECONDS,
  safeEqual,
  verifyBodySignature,
  verifyTimestampedSignature,
  webhookEventKey,
} from '@/lib/payments/signature';

/**
 * A webhook is the one endpoint an attacker can reach without credentials.
 * Everything below is a rule the verifier must never relax.
 */

const SECRET = 'whsec_test_2f8c1a9b7e4d6c3a';
const BODY = JSON.stringify({ id: 'evt_1', status: 'SUCCESSFUL', amount: 145_050, currency: 'AED' });

function stripeHeader(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${hmacHex(secret, `${timestamp}.${body}`)}`;
}

describe('constant-time comparison', () => {
  it('matches identical strings and rejects everything else', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false); // length mismatch must not throw
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('timestamped signatures (t=…,v1=…)', () => {
  it('accepts a correctly signed, fresh payload', () => {
    const result = verifyTimestampedSignature({ header: stripeHeader(BODY, SECRET), rawBody: BODY, secret: SECRET });
    expect(result.valid).toBe(true);
  });

  it('rejects a body that was altered after signing', () => {
    const header = stripeHeader(BODY, SECRET);
    const tampered = BODY.replace('145050', '1');
    const result = verifyTimestampedSignature({ header, rawBody: tampered, secret: SECRET });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });

  it('rejects a signature made with a different secret', () => {
    const header = stripeHeader(BODY, 'whsec_someone_elses_key');
    expect(verifyTimestampedSignature({ header, rawBody: BODY, secret: SECRET }).valid).toBe(false);
  });

  it('rejects a replayed signature older than the tolerance', () => {
    const stale = Math.floor(Date.now() / 1000) - (REPLAY_TOLERANCE_SECONDS + 60);
    const result = verifyTimestampedSignature({
      header: stripeHeader(BODY, SECRET, stale),
      rawBody: BODY,
      secret: SECRET,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('timestamp_outside_tolerance');
  });

  it('rejects a signature timestamped in the future beyond tolerance', () => {
    const ahead = Math.floor(Date.now() / 1000) + (REPLAY_TOLERANCE_SECONDS + 60);
    expect(
      verifyTimestampedSignature({ header: stripeHeader(BODY, SECRET, ahead), rawBody: BODY, secret: SECRET }).reason,
    ).toBe('timestamp_outside_tolerance');
  });

  it('accepts a signature just inside the tolerance', () => {
    const edge = Math.floor(Date.now() / 1000) - (REPLAY_TOLERANCE_SECONDS - 30);
    expect(
      verifyTimestampedSignature({ header: stripeHeader(BODY, SECRET, edge), rawBody: BODY, secret: SECRET }).valid,
    ).toBe(true);
  });

  it('refuses to verify when no secret is configured', () => {
    const result = verifyTimestampedSignature({ header: stripeHeader(BODY, SECRET), rawBody: BODY, secret: '' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing_secret');
  });

  it('rejects a missing or malformed header rather than passing it through', () => {
    expect(verifyTimestampedSignature({ header: null, rawBody: BODY, secret: SECRET }).reason).toBe(
      'missing_signature_header',
    );
    expect(verifyTimestampedSignature({ header: 'garbage', rawBody: BODY, secret: SECRET }).reason).toBe(
      'malformed_signature',
    );
    expect(verifyTimestampedSignature({ header: 't=abc,v1=def', rawBody: BODY, secret: SECRET }).reason).toBe(
      'malformed_signature',
    );
  });

  it('is sensitive to whitespace — the raw bytes are what is signed', () => {
    const header = stripeHeader(BODY, SECRET);
    const reserialised = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifyTimestampedSignature({ header, rawBody: reserialised, secret: SECRET }).valid).toBe(false);
  });
});

describe('plain body signatures', () => {
  it('accepts a matching hex digest, with or without the sha256= prefix', () => {
    const digest = hmacHex(SECRET, BODY);
    expect(verifyBodySignature({ header: digest, rawBody: BODY, secret: SECRET }).valid).toBe(true);
    expect(verifyBodySignature({ header: `sha256=${digest}`, rawBody: BODY, secret: SECRET }).valid).toBe(true);
    expect(verifyBodySignature({ header: ` ${digest} `, rawBody: BODY, secret: SECRET }).valid).toBe(true);
  });

  it('accepts a base64 digest when the provider uses one', () => {
    const digest = hmacBase64(SECRET, BODY);
    expect(verifyBodySignature({ header: digest, rawBody: BODY, secret: SECRET, encoding: 'base64' }).valid).toBe(true);
    // …and does not silently accept it as hex.
    expect(verifyBodySignature({ header: digest, rawBody: BODY, secret: SECRET }).valid).toBe(false);
  });

  it('rejects a tampered body, a wrong secret, and a missing secret', () => {
    const digest = hmacHex(SECRET, BODY);
    expect(verifyBodySignature({ header: digest, rawBody: `${BODY} `, secret: SECRET }).valid).toBe(false);
    expect(verifyBodySignature({ header: digest, rawBody: BODY, secret: 'other' }).valid).toBe(false);
    expect(verifyBodySignature({ header: digest, rawBody: BODY, secret: '' }).reason).toBe('missing_secret');
    expect(verifyBodySignature({ header: null, rawBody: BODY, secret: SECRET }).reason).toBe(
      'missing_signature_header',
    );
  });
});

describe('idempotency keys', () => {
  it('namespaces an event id by provider so two providers cannot collide', () => {
    expect(webhookEventKey('mtn_momo', 'evt_1')).toBe('mtn_momo:evt_1');
    expect(webhookEventKey('card', 'evt_1')).not.toBe(webhookEventKey('mtn_momo', 'evt_1'));
  });

  it('is stable for the same event, which is what makes redelivery a no-op', () => {
    expect(webhookEventKey('card', 'evt_9')).toBe(webhookEventKey('card', 'evt_9'));
  });
});
