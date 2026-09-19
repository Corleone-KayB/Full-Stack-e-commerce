'use client';

/**
 * Browser → API helper.
 *
 * Attaches the CSRF token to every state-changing request, unwraps the shared
 * response envelope, and turns a failure into a typed error the UI can render
 * without knowing anything about HTTP.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: { fields?: Record<string, string> } & Record<string, unknown>;
  readonly ref?: string;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: Record<string, unknown>,
    ref?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.ref = ref;
  }

  /** Field-level messages, for rendering next to inputs. */
  get fieldErrors(): Record<string, string> {
    return (this.details?.fields as Record<string, string>) ?? {};
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Skip the JSON body (for 204 responses). */
  raw?: boolean;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    const csrf = readCookie('aurum_csrf');
    if (csrf) headers['x-aurum-csrf'] = csrf;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      signal: options.signal,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError('NETWORK', 'We could not reach the server. Check your connection and try again.', 0);
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('INTERNAL', 'The server returned an unexpected response.', response.status);
  }

  const envelope = payload as
    | { ok: true; data: T; meta?: Record<string, unknown> }
    | { ok: false; error: { code: string; message: string; details?: Record<string, unknown>; ref?: string } };

  if (!envelope || typeof envelope !== 'object' || !('ok' in envelope)) {
    throw new ApiError('INTERNAL', 'The server returned an unexpected response.', response.status);
  }

  if (!envelope.ok) {
    throw new ApiError(
      envelope.error.code,
      envelope.error.message,
      response.status,
      envelope.error.details,
      envelope.error.ref,
    );
  }

  return envelope.data;
}

export const apiGet = <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const apiPost = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body });
export const apiPatch = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body });
export const apiDelete = <T>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });

/** Human message for any thrown value, safe to show a customer. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
