import { NextResponse } from 'next/server';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { AppError } from './errors';
import { correlationId, logger } from './logger';

/**
 * API boundary.
 *
 * Every route handler is wrapped so that:
 *   - success responses share one envelope,
 *   - AppErrors become their declared status with a safe message,
 *   - anything else becomes a 500 with a correlation id and nothing else,
 *   - Zod failures become a field-keyed 422 the forms can render directly.
 */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiFailure {
  ok: false;
  error: { code: string; message: string; details?: unknown; ref?: string };
}

export function ok<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data, ...(meta ? { meta } : {}) }, init);
}

export function created<T>(data: T, meta?: Record<string, unknown>) {
  return ok(data, meta, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function failure(code: string, message: string, status: number, details?: unknown, ref?: string) {
  return NextResponse.json<ApiFailure>(
    { ok: false, error: { code, message, ...(details ? { details } : {}), ...(ref ? { ref } : {}) } },
    { status },
  );
}

function zodDetails(error: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_';
    if (!fields[path]) fields[path] = issue.message;
  }
  return { fields };
}

export function toErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return failure('VALIDATION_ERROR', 'Please check the highlighted fields.', 422, zodDetails(error));
  }
  if (error instanceof AppError) {
    if (error.status >= 500) {
      const ref = correlationId();
      logger.error('api.app_error', { ref, code: error.code, message: error.message, internal: error.internal });
      return failure(error.code, error.message, error.status, undefined, ref);
    }
    return failure(error.code, error.message, error.status, error.details);
  }
  const ref = correlationId();
  logger.error('api.unhandled', {
    ref,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
  });
  // Deliberately generic: no stack, no driver message, no query text.
  return failure('INTERNAL', 'Something went wrong on our side. Please try again.', 500, undefined, ref);
}

type Handler<Ctx> = (request: Request, context: Ctx) => Promise<Response> | Response;

/** Wraps a route handler with uniform error handling. */
export function route<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/** Parses and validates a JSON body. Rejects oversized payloads. */
export async function parseBody<S extends ZodTypeAny>(request: Request, schema: S): Promise<z.infer<S>> {
  const raw = await request.text();
  if (raw.length > 1_000_000) {
    throw new AppError('BAD_REQUEST', 'Request body is too large.');
  }
  let json: unknown;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    throw new AppError('BAD_REQUEST', 'Expected a JSON body.');
  }
  return schema.parse(json);
}

export function parseQuery<S extends ZodTypeAny>(request: Request, schema: S): z.infer<S> {
  const url = new URL(request.url);
  const entries: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    entries[key] = all.length > 1 ? all : all[0];
  }
  return schema.parse(entries);
}

/** Best-effort client IP for rate limiting and audit rows. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? '0.0.0.0';
}

export function userAgent(request: Request): string | null {
  return request.headers.get('user-agent');
}
