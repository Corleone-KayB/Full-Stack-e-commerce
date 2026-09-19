/**
 * Error taxonomy.
 *
 * Anything thrown as an AppError carries a machine code and a message that is
 * safe to show a customer. Everything else is caught by the API wrapper,
 * logged with a correlation id, and reported to the client as a generic
 * failure — internal messages and stack traces never cross the boundary.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'OUT_OF_STOCK'
  | 'PRICE_CHANGED'
  | 'CART_EMPTY'
  | 'COUPON_INVALID'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  OUT_OF_STOCK: 409,
  PRICE_CHANGED: 409,
  CART_EMPTY: 400,
  COUPON_INVALID: 422,
  PAYMENT_FAILED: 402,
  PAYMENT_TIMEOUT: 408,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_NOT_CONFIGURED: 501,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  /** Extra context for logs only — never serialised to the client. */
  readonly internal?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: unknown; internal?: unknown } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.details = options.details;
    this.internal = options.internal;
  }
}

export const badRequest = (m: string, details?: unknown) => new AppError('BAD_REQUEST', m, { details });
export const notFound = (m = 'Not found') => new AppError('NOT_FOUND', m);
export const forbidden = (m = 'You do not have access to this resource.') => new AppError('FORBIDDEN', m);
export const unauthenticated = (m = 'Please sign in to continue.') => new AppError('UNAUTHENTICATED', m);
export const conflict = (m: string, details?: unknown) => new AppError('CONFLICT', m, { details });
export const outOfStock = (m: string, details?: unknown) => new AppError('OUT_OF_STOCK', m, { details });

/** Customer-facing copy for each failure mode. Used by storefront error UI. */
export const ERROR_COPY: Record<ErrorCode, { title: string; body: string }> = {
  BAD_REQUEST: { title: 'Something looks off', body: 'We could not process that request. Please check and try again.' },
  VALIDATION_ERROR: { title: 'Check your details', body: 'Some information is missing or invalid.' },
  UNAUTHENTICATED: { title: 'Sign in required', body: 'Please sign in to continue.' },
  FORBIDDEN: { title: 'Not available', body: 'You do not have access to this area.' },
  NOT_FOUND: { title: 'Not found', body: 'We could not find what you were looking for.' },
  CONFLICT: { title: 'Something changed', body: 'This item changed while you were shopping. Please review and retry.' },
  OUT_OF_STOCK: { title: 'Out of stock', body: 'This item sold out while it was in your bag.' },
  PRICE_CHANGED: { title: 'Price updated', body: 'The price changed since you added this. Please review your bag.' },
  CART_EMPTY: { title: 'Your bag is empty', body: 'Add something before checking out.' },
  COUPON_INVALID: { title: 'Code not valid', body: 'That promotion code cannot be applied to this order.' },
  PAYMENT_FAILED: { title: "Payment wasn't completed", body: 'No money has left your account. You can try again or choose another method.' },
  PAYMENT_TIMEOUT: { title: 'Payment timed out', body: 'We did not receive confirmation in time. Your order is saved — you can retry payment.' },
  PROVIDER_UNAVAILABLE: { title: 'Payment method unavailable', body: 'This provider is temporarily unreachable. Please choose another method.' },
  PROVIDER_NOT_CONFIGURED: { title: 'Not enabled yet', body: 'This payment method has not been activated for this store.' },
  RATE_LIMITED: { title: 'Slow down a moment', body: 'Too many attempts. Please wait a few seconds and try again.' },
  INTERNAL: { title: 'Something went wrong', body: 'We hit an unexpected problem. Please try again shortly.' },
};
