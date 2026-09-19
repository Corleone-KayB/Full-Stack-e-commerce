import { AppError } from './errors';

/**
 * Fixed-window rate limiter.
 *
 * In-memory by design: it protects a single instance without adding infra to
 * the starter. For multi-instance deployments swap `store` for Redis
 * (INCR + EXPIRE) — the call sites do not change. See docs/DEPLOYMENT.md.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of store) if (bucket.resetAt <= now) store.delete(key);
}

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export const RATE_LIMITS = {
  login: { limit: 8, windowMs: 5 * 60_000 },
  register: { limit: 5, windowMs: 10 * 60_000 },
  passwordReset: { limit: 5, windowMs: 15 * 60_000 },
  paymentInitiate: { limit: 10, windowMs: 5 * 60_000 },
  paymentStatus: { limit: 120, windowMs: 60_000 },
  checkout: { limit: 20, windowMs: 10 * 60_000 },
  search: { limit: 90, windowMs: 60_000 },
  write: { limit: 60, windowMs: 60_000 },
  webhook: { limit: 600, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

export function consume(identifier: string, rule: RateLimitRule): RateLimitResult {
  if (process.env.RATE_LIMIT_ENABLED === 'false') {
    return { ok: true, remaining: rule.limit, resetAt: Date.now() + rule.windowMs };
  }
  const now = Date.now();
  sweep(now);
  const bucket = store.get(identifier);
  if (!bucket || bucket.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + rule.windowMs };
    store.set(identifier, fresh);
    return { ok: true, remaining: rule.limit - 1, resetAt: fresh.resetAt };
  }
  bucket.count += 1;
  return {
    ok: bucket.count <= rule.limit,
    remaining: Math.max(0, rule.limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/** Throws a 429 AppError when the caller is over budget. */
export function enforceRateLimit(name: RateLimitName, identifier: string): RateLimitResult {
  const rule = RATE_LIMITS[name];
  const result = consume(`${name}:${identifier}`, rule);
  if (!result.ok) {
    const seconds = Math.ceil((result.resetAt - Date.now()) / 1000);
    throw new AppError('RATE_LIMITED', `Too many attempts. Try again in ${seconds}s.`, {
      details: { retryAfterSeconds: seconds },
    });
  }
  return result;
}

/** Test seam. */
export function __resetRateLimits() {
  store.clear();
}
