import { requirePagePermission } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { getTaxonomyBundle } from '@/lib/services/taxonomy.service';
import { EMPTY_DRAFT, ProductForm } from '@/components/admin/product-form';
import { PageHeader } from '@/components/admin/data-table';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New product' };

export default async function NewProductPage() {
  await requirePagePermission('product:write');
  const [taxonomy, settings] = await Promise.all([getTaxonomyBundle(), getSettings()]);

  return (
    <>
      <PageHeader
        title="New product"
        description="Everything is editable later. Save a draft at any point — nothing is published until you say so."
      />
      <ProductForm
        initial={EMPTY_DRAFT}
        categories={taxonomy.categories}
        brands={taxonomy.brands}
        seriesList={taxonomy.series}
        attributes={taxonomy.attributes.map((attribute) => ({
          id: attribute.id,
          key: attribute.key,
          name: attribute.name,
          isVariantAxis: attribute.isVariantAxis,
          inputType: attribute.inputType,
          unit: attribute.unit,
          values: attribute.values.map((value) => ({
            id: value.id,
            value: value.value,
            label: value.label,
            hex: value.hex,
          })),
        }))}
        currencyCode={settings.currency.base}
      />
    </>
  );
}
