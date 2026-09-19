import { clientIp, ok, parseQuery, route } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { suggest } from '@/lib/services/catalog.service';
import { searchQuerySchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/search?q= — typeahead suggestions with thumbnails and prices. */
export const GET = route(async (request) => {
  enforceRateLimit('search', clientIp(request));
  const { q, limit } = parseQuery(request, searchQuerySchema);
  return ok(await suggest(q, limit ?? 6));
});
