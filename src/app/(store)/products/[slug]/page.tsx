import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { getRequestedCurrency } from '@/lib/server-context';
import { getProductBySlug, getRelatedProducts, recordProductView } from '@/lib/services/catalog.service';
import { toMajor } from '@/lib/money';
import { getCurrency } from '@/lib/services/currency.service';
import { Breadcrumbs, ProductGallery, ProductInformation, ProductPurchasePanel } from '@/components/store/product-detail';
import { ProductRail, SectionHeading } from '@/components/store/sections';

type Params = Promise<{ slug: string }>;

export const revalidate = 60;

export async function generateStaticParams() {
  // Pre-render the catalogue at build time; anything added later is rendered
  // on first request and then cached.
  const products = await prisma.product
    .findMany({ where: { active: true }, select: { slug: true }, take: 200 })
    .catch(() => []);
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const [product, settings] = await Promise.all([getProductBySlug(slug), getSettings()]);
  if (!product) return { title: 'Product not found' };

  const title = product.metaTitle ?? product.name;
  const description =
    product.metaDescription ?? product.shortDescription ?? settings.seo.defaultDescription;

  return {
    title,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `/products/${product.slug}`,
      images: product.image ? [{ url: product.image.url, alt: product.image.alt }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const currency = await getRequestedCurrency();
  const product = await getProductBySlug(slug, currency ?? undefined);
  if (!product) notFound();

  const [settings, related, faqs, currencyMeta] = await Promise.all([
    getSettings(),
    getRelatedProducts(product, 4),
    prisma.faq
      .findMany({ where: { active: true, topic: { in: ['products', 'warranty', 'delivery'] } }, take: 5 })
      .catch(() => []),
    getCurrency(product.displayCurrency),
  ]);

  // Fire-and-forget: the page must not wait on an analytics write.
  void recordProductView(product.id);

  const inStock = product.stockStatus !== 'OUT_OF_STOCK';

  // Product + breadcrumb structured data, from real values only.
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription ?? undefined,
    sku: product.variants[0]?.sku,
    brand: { '@type': 'Brand', name: product.brand.name },
    image: product.images.map((image) => image.url),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: product.displayCurrency,
      lowPrice: toMajor(product.fromPrice, currencyMeta.precision),
      highPrice: toMajor(
        Math.max(...product.variants.map((v) => v.displayPrice), product.fromPrice),
        currencyMeta.precision,
      ),
      offerCount: product.variants.length,
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: settings.store.name },
    },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
      { '@type': 'ListItem', position: 2, name: 'Shop', item: '/shop' },
      ...(product.series
        ? [{ '@type': 'ListItem', position: 3, name: product.series.name, item: `/shop?series=${product.series.slug}` }]
        : []),
      { '@type': 'ListItem', position: product.series ? 4 : 3, name: product.name },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([productSchema, breadcrumbSchema]) }}
      />

      <div className="container py-8 lg:py-12">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Shop', href: '/shop' },
            ...(product.series ? [{ label: product.series.name, href: `/shop?series=${product.series.slug}` }] : []),
            { label: product.name },
          ]}
        />

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <ProductGallery product={product} />
          <ProductPurchasePanel
            product={product}
            deliveryCopy={settings.delivery.estimateCopy}
            warrantyCopy={`${product.warrantyMonths}-month warranty against hardware faults.`}
          />
        </div>

        <section className="mt-20 lg:mt-24">
          <ProductInformation product={product} faqs={faqs} />
        </section>

        {related.length > 0 && (
          <section className="mt-20 lg:mt-24">
            <SectionHeading
              eyebrow="You might also like"
              title="Similar devices"
              href={product.series ? `/shop?series=${product.series.slug}` : '/shop'}
            />
            <ProductRail products={related} />
          </section>
        )}
      </div>

      {/* Space so the mobile sticky bar never covers the footer's last row. */}
      <div className="h-20 lg:hidden" aria-hidden />
    </>
  );
}
