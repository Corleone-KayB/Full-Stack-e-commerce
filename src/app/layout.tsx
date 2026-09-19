import type { Metadata, Viewport } from 'next';

/**
 * Typography is self-hosted rather than loaded from a font CDN: no
 * third-party request on first paint, no privacy footnote, and the store
 * still renders correctly on a network that blocks external font hosts.
 * The families are declared as CSS variables in globals.css.
 */
import '@fontsource-variable/inter';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './globals.css';

import { getSettings } from '@/lib/settings';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const base = process.env.APP_URL || 'http://localhost:3000';

  return {
    metadataBase: new URL(base),
    title: {
      default: settings.seo.siteTitle,
      template: settings.seo.titleTemplate,
    },
    description: settings.seo.defaultDescription,
    applicationName: settings.store.name,
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      siteName: settings.store.name,
      title: settings.seo.siteTitle,
      description: settings.seo.defaultDescription,
      images: [{ url: settings.seo.ogImageUrl ?? '/brand/og.svg', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      site: settings.seo.twitterHandle ?? undefined,
    },
    robots: { index: true, follow: true },
    manifest: '/manifest.webmanifest',
    /**
     * The SVG is the sharp one modern browsers prefer; the .ico is what every
     * browser asks for at /favicon.ico whether it is declared or not, and the
     * apple-touch-icon is what iOS uses when someone adds the shop to their
     * home screen. Omitting the last two is how a store ends up as a grey
     * rectangle on a customer's phone.
     */
    icons: {
      icon: settings.store.faviconUrl
        ? [{ url: settings.store.faviconUrl }]
        : [
            { url: '/favicon.svg', type: 'image/svg+xml' },
            { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
            { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
          ],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF8F5' },
    { media: '(prefers-color-scheme: dark)', color: '#0A0A0B' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();

  return (
    <html lang="en" suppressHydrationWarning data-default-theme={settings.appearance.defaultTheme}>
      <body className="min-h-dvh font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200]
                     focus:rounded focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-canvas"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
