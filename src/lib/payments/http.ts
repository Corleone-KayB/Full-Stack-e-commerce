import { AppError } from '../errors';
import { logger } from '../logger';
import { redact } from '../json';

/**
 * Outbound HTTP for payment adapters: bounded timeout, no retries on
 * non-idempotent calls, structured logging with redaction, and provider
 * failures normalised into AppErrors the checkout UI can render.
 */

export interface ProviderRequest {
  provider: string;
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  /** 'json' | 'form' — form uses application/x-www-form-urlencoded. */
  encoding?: 'json' | 'form';
  timeoutMs?: number;
  /** Retry idempotent GETs on transport failure. */
  retries?: number;
}

export interface ProviderResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T;
  rawText: string;
}

function encodeForm(body: Record<string, unknown>, prefix = ''): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object' && !Array.isArray(value)) {
      parts.push(...encodeForm(value as Record<string, unknown>, name));
    } else if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        if (typeof entry === 'object' && entry !== null) {
          parts.push(...encodeForm(entry as Record<string, unknown>, `${name}[${index}]`));
        } else {
          parts.push(`${encodeURIComponent(`${name}[${index}]`)}=${encodeURIComponent(String(entry))}`);
        }
      });
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts;
}

export async function providerFetch<T = unknown>(request: ProviderRequest): Promise<ProviderResponse<T>> {
  const {
    provider,
    url,
    method = 'GET',
    headers = {},
    body,
    encoding = 'json',
    timeoutMs = 20_000,
    retries = 0,
  } = request;

  const started = Date.now();
  let attempt = 0;

  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const init: RequestInit = { method, signal: controller.signal, headers: { ...headers } };
      if (body !== undefined && method !== 'GET') {
        if (encoding === 'form') {
          init.body = encodeForm(body as Record<string, unknown>).join('&');
          (init.headers as Record<string, string>)['Content-Type'] = 'application/x-www-form-urlencoded';
        } else {
          init.body = typeof body === 'string' ? body : JSON.stringify(body);
          (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
        }
      }

      const response = await fetch(url, init);
      clearTimeout(timer);
      const rawText = await response.text();
      let data: unknown = null;
      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = rawText;
        }
      }

      logger.debug('payment.http', {
        provider,
        method,
        url: url.replace(/\/[0-9a-f-]{20,}/gi, '/:ref'),
        status: response.status,
        ms: Date.now() - started,
        response: redact(data),
      });

      return { status: response.status, ok: response.ok, data: data as T, rawText };
    } catch (error) {
      clearTimeout(timer);
      const aborted = error instanceof Error && error.name === 'AbortError';
      if (attempt < retries && method === 'GET') {
        attempt += 1;
        await new Promise((r) => setTimeout(r, 250 * attempt));
        continue;
      }
      logger.error('payment.http_failed', {
        provider,
        method,
        aborted,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppError(
        aborted ? 'PAYMENT_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
        aborted
          ? 'The payment provider did not respond in time. Your order is saved — please retry.'
          : 'We could not reach the payment provider. Please try again or choose another method.',
        { internal: { provider, url, error: String(error) } },
      );
    }
  }
}

/** Simple in-process OAuth token cache keyed by provider. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function cachedToken(
  key: string,
  ttlSeconds: number,
  factory: () => Promise<string>,
): Promise<string> {
  const hit = tokenCache.get(key);
  if (hit && hit.expiresAt > Date.now() + 30_000) return hit.token;
  const token = await factory();
  tokenCache.set(key, { token, expiresAt: Date.now() + ttlSeconds * 1000 });
  return token;
}

export function clearTokenCache() {
  tokenCache.clear();
}
