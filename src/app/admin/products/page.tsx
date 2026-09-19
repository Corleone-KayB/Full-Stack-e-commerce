import { Suspense } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePagePermission } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { getCurrency } from '@/lib/services/currency.service';
import { listAdminProducts } from '@/lib/services/product-admin.service';
import { getTaxonomyBundle } from '@/lib/services/taxonomy.service';
import { ProductsTable } from '@/components/admin/products-table';
import { PageHeader } from '@/components/admin/data-table';
import { LinkButton } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Products' };

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function AdminProductsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePagePermission('product:read');
  const params = await searchParams;

  const [result, taxonomy, currency] = await Promise.all([
    listAdminProducts({
      page: Number(params.page ?? 1),
      perPage: 25,
      q: params.q,
      status: params.status,
      categoryId: params.category,
      seriesId: params.series,
    }),
    getTaxonomyBundle(),
    getCurrency('AED'),
  ]);

  return (
    <>
      <PageHeader
        title="Products"
        description="Every product and its variants. Prices, stock and publication state are all editable here — no developer needed."
        actions={
          <>
            <LinkButton href="/admin/catalog/import-export" variant="secondary" size="sm">
              Import / export
            </LinkButton>
            <LinkButton href="/admin/products/new" size="sm">
              <Plus className="h-3.5 w-3.5" />
              New product
            </LinkButton>
          </>
        }
      />

      <Suspense fallback={<div className="skeleton h-96 rounded-lg" />}>
        <ProductsTable
          rows={result.rows.map((row) => ({
            ...row,
            priceLabel:
              row.minPrice === row.maxPrice
                ? formatMoney(row.minPrice, currency)
                : `${formatMoney(row.minPrice, currency, { showCode: false })} – ${formatMoney(row.maxPrice, currency)}`,
            updatedAtLabel: new Intl.DateTimeFormat('en-GB', {
              day: '2-digit',
              month: 'short',
            }).format(row.updatedAt),
          }))}
          total={result.total}
          page={result.page}
          perPage={result.perPage}
          categories={taxonomy.categories}
          seriesOptions={taxonomy.series}
        />
      </Suspense>

      <p className="mt-5 text-xs text-faint">
        Looking for a product that is not listed?{' '}
        <Link href="/admin/products?status=draft" className="text-accent underline underline-offset-4">
          Drafts are hidden from the storefront
        </Link>{' '}
        until you publish them.
      </p>
    </>
  );
}
