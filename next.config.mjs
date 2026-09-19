/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    // Product imagery is managed in the database; hosts are allow-listed here.
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'cdn.aurum.example' },
      { protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
      { protocol: 'https', hostname: '**.s3.amazonaws.com' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
    ],
  },
  /**
   * Database drivers load platform-specific native modules at runtime and must
   * not be bundled; bcryptjs is listed so the hashing cost is not affected by
   * webpack's module wrapping.
   */
  serverExternalPackages: [
    '@libsql/client',
    'libsql',
    'pg',
    '@prisma/adapter-libsql',
    '@prisma/adapter-pg',
    '@prisma/client',
    'bcryptjs',
  ],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Never let a payment webhook be cached or indexed.
      {
        source: '/api/payments/webhook/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

export default nextConfig;
