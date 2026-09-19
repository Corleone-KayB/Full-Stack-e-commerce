import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { requirePagePermission } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { toMajor } from '@/lib/money';
import { decodeJson } from '@/lib/json';
import { getAdminProduct } from '@/lib/services/product-admin.service';
import { getTaxonomyBundle } from '@/lib/services/taxonomy.service';
import { ProductForm, type ProductDraft } from '@/components/admin/product-form';
import { PageHeader } from '@/components/admin/data-table';
import { Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const product = await getAdminProduct(id);
  return { title: product ? product.name : 'Product' };
}

export default async function EditProductPage({ params }: { params: Params }) {
  await requirePagePermission('product:read');
  const { id } = await params;

  const [product, taxonomy, settings] = await Promise.all([
    getAdminProduct(id),
    getTaxonomyBundle(),
    getSettings(),
  ]);
  if (!product) notFound();

  const money = (minor: number | null | undefined) => (minor == null ? '' : String(toMajor(minor)));

  const draft: ProductDraft = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brandId: product.brandId,
    categoryId: product.categoryId,
    seriesId: product.seriesId ?? '',
    model: product.model ?? '',
    shortDescription: product.shortDescription ?? '',
    description: product.description ?? '',
    condition: product.condition,
    warrantyMonths: String(product.warrantyMonths),
    featured: product.featured,
    bestseller: product.bestseller,
    newArrival: product.newArrival,
    active: product.active,
    metaTitle: product.metaTitle ?? '',
    metaDescription: product.metaDescription ?? '',
    images: product.images.map((image) => ({ url: image.url, alt: image.alt ?? '' })),
    specSheet: decodeJson<{ group: string; label: string; value: string }[]>(product.specSheet, []),
    attributes: Object.fromEntries(
      product.attributes.map((link) => [link.attribute.key, link.value?.label ?? link.valueText ?? '']),
    ),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      price: money(variant.price),
      compareAtPrice: money(variant.compareAtPrice),
      costPrice: money(variant.costPrice),
      stock: String(variant.inventory?.onHand ?? 0),
      lowStockThreshold: String(variant.inventory?.lowStockThreshold ?? 3),
      active: variant.active,
      batteryHealth: variant.batteryHealth ? String(variant.batteryHealth) : '',
      imageUrl: variant.imageUrl ?? '',
      attributes: Object.fromEntries(product.variants.length ? variant.attributes.map((link) => [link.attribute.key, link.value.value]) : []),
    })),
  };

  const reserved = product.variants.reduce((sum, variant) => sum + (variant.inventory?.reserved ?? 0), 0);

  return (
    <>
      <PageHeader
        title={product.name}
        description={`${product.variants.length} variant${product.variants.length === 1 ? '' : 's'} · updated ${new Intl.DateTimeFormat(
          'en-GB',
          { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' },
        ).format(product.updatedAt)}`}
        actions={
          <>
            <Badge tone={product.active ? 'positive' : 'neutral'}>{product.active ? 'Live' : 'Draft'}</Badge>
            {reserved > 0 && <Badge tone="info">{reserved} reserved</Badge>}
            <Link
              href={`/products/${product.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded border border-hairline px-3 py-2 text-[13px] text-muted transition-colors hover:border-accent hover:text-accent"
            >
              View on store
              <ExternalLink className="h-3 w-3" />
            </Link>
          </>
        }
      />

      <ProductForm
        initial={draft}
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
