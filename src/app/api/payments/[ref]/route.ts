import { clientIp, ok, route } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { pollPaymentStatus } from '@/lib/services/payment.service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ ref: string }> };

/**
 * GET /api/payments/[ref] — status poll for the checkout waiting screen.
 *
 * Each poll re-verifies with the provider rather than reading a cached row, so
 * the answer is the provider's, not ours. Rate limited because the client
 * polls every couple of seconds while a handset prompt is outstanding.
 */
export const GET = route<Ctx>(async (request, { params }) => {
  const { ref } = await params;
  enforceRateLimit('paymentStatus', `${clientIp(request)}:${ref}`);
  return ok(await pollPaymentStatus(ref));
});
