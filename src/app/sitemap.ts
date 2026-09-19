import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';

/**
 * Sitemap.
 *
 * Static routes, every active product, every series filter (they are real
 * landing pages people search for) and every published content page.
 * Account, cart and checkout are excluded — they are noindex.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? 'http://localhost:3000';

  const [products, series, categories, pages] = await Promise.all([
    prisma.product
      .findMany({ where: { active: true }, select: { slug: true, updatedAt: true } })
      .catch(() => []),
    prisma.series.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }).catch(() => []),
    prisma.category
      .findMany({ where: { active: true, products: { some: { active: true } } }, select: { slug: true, updatedAt: true } })
      .catch(() => []),
    prisma.contentPage.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }).catch(() => []),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/shop`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/deals`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/faq`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: 'monthly', priority: 0.4 },
  ];

  return [
    ...staticRoutes,
    ...products.map((product) => ({
      url: `${base}/products/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...series.map((row) => ({
      url: `${base}/shop?series=${row.slug}`,
      lastModified: row.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...categories.map((row) => ({
      url: `${base}/shop?category=${row.slug}`,
      lastModified: row.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...pages.map((page) => ({
      url: `${base}/pages/${page.slug}`,
      lastModified: page.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
  ];
}
