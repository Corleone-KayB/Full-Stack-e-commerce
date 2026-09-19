import { requirePermission } from '@/lib/auth';
import { toErrorResponse } from '@/lib/api';
import { exportProductsCsv, importTemplateCsv } from '@/lib/services/import-export.service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/export?type=products|template
 *
 * Returns a real file download rather than the JSON envelope, because the
 * browser needs a text/csv body with a filename to save it.
 */
export async function GET(request: Request) {
  try {
    await requirePermission('product:read');
    const type = new URL(request.url).searchParams.get('type') ?? 'products';

    const csv = type === 'template' ? importTemplateCsv() : await exportProductsCsv();
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = type === 'template' ? 'aurum-import-template.csv' : `aurum-products-${stamp}.csv`;

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
