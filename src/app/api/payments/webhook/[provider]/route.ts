import { NextResponse } from 'next/server';
import { clientIp } from '@/lib/api';
import { logger } from '@/lib/logger';
import { consume, RATE_LIMITS } from '@/lib/rate-limit';
import { processWebhook } from '@/lib/services/payment.service';

/**
 * Payment provider callbacks.
 *
 * Deliberately NOT wrapped in the standard route() helper:
 *   - no CSRF check (the caller is a provider, not a browser),
 *   - the raw body is read as text before anything parses it, because a
 *     signature must be verified against the exact bytes received,
 *   - the response is a bare 200/401 with no envelope, because providers
 *     retry on anything else and we do not want a retry storm from a bug in
 *     our own serialisation.
 *
 * Everything downstream is idempotent: a redelivered event writes nothing.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ provider: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const { provider } = await params;

  // Generous, but enough to stop an unauthenticated flood.
  const limit = consume(`webhook:${provider}:${clientIp(request)}`, RATE_LIMITS.webhook);
  if (!limit.ok) return new NextResponse('Too many requests', { status: 429 });

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new NextResponse('Bad request', { status: 400 });
  }

  if (rawBody.length > 512_000) {
    return new NextResponse('Payload too large', { status: 413 });
  }

  try {
    const outcome = await processWebhook(provider, {
      rawBody,
      headers: request.headers,
      url: request.url,
    });

    if (!outcome.accepted) {
      logger.warn('webhook.rejected', { provider, reason: outcome.reason });
      // 401 rather than 400: the provider should not keep retrying a payload
      // we will never accept, and the reason is authentication.
      return new NextResponse('Rejected', { status: 401 });
    }

    // 200 for both fresh and duplicate deliveries — a duplicate is a success
    // from the provider's point of view, and retrying it changes nothing.
    return NextResponse.json({ received: true, duplicate: outcome.duplicate }, { status: 200 });
  } catch (error) {
    logger.error('webhook.unhandled', {
      provider,
      error: error instanceof Error ? error.message : String(error),
    });
    // 500 tells the provider to retry, which is right: we failed, not them.
    return new NextResponse('Processing error', { status: 500 });
  }
}

/** Some providers probe the endpoint with a GET before enabling it. */
export async function GET() {
  return NextResponse.json({ status: 'ready' }, { status: 200 });
}
