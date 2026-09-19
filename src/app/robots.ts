import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? 'http://localhost:3000';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Anything personal, transactional or infinitely faceted stays out of
        // the index — it is not useful in search and wastes crawl budget.
        disallow: ['/admin', '/api/', '/account', '/cart', '/checkout', '/order/', '/shop?'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
