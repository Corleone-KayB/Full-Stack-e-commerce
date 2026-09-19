import { requirePagePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CSV_COLUMNS } from '@/lib/services/import-export.service';
import { ImportExportScreen } from '@/components/admin/import-export-screen';
import { PageHeader } from '@/components/admin/data-table';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Import / export' };

export default async function ImportExportPage() {
  await requirePagePermission('product:write');
  const [products, variants] = await Promise.all([
    prisma.product.count(),
    prisma.productVariant.count(),
  ]);

  return (
    <>
      <PageHeader
        title="Import / export"
        description="Bulk price and stock changes over a spreadsheet. Nothing is written until you have seen exactly what will change."
      />
      <ImportExportScreen productCount={products} variantCount={variants} columns={[...CSV_COLUMNS]} />
    </>
  );
}
