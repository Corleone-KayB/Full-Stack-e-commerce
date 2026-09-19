/**
 * JSON columns.
 *
 * SQLite has no native JSON column in Prisma, so structured values are stored
 * as text. These helpers keep that decision in one place — swapping to a
 * Postgres `jsonb` column later means changing these two functions.
 */

export function encodeJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function decodeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

const SECRET_KEY_PATTERN =
  /(secret|password|passwd|pin|token|api[_-]?key|authorization|cvv|cvc|card[_-]?number|pan|iban)/i;

/**
 * Redacts anything that looks like a credential before it is written to a log,
 * an audit row or a payment event. Applied recursively; long digit strings that
 * look like a PAN are truncated to the last four.
 */
export function redact<T>(value: T, depth = 0): T {
  if (depth > 6) return '[depth-limit]' as unknown as T;
  if (value == null) return value;
  if (typeof value === 'string') {
    const digits = value.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && /^[\d\s-]+$/.test(value)) {
      return (`•••• ${digits.slice(-4)}`) as unknown as T;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out as unknown as T;
  }
  return value;
}

export function encodeRedactedJson(value: unknown): string {
  return encodeJson(redact(value));
}
