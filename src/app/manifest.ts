import type { MetadataRoute } from 'next';
import { getSettings } from '@/lib/settings';

/**
 * Web app manifest, generated from the merchant's own settings — so renaming
 * the store in the admin renames it on a customer's home screen too, rather
 * than leaving a stale name baked into a static file.
 */
export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSettings();

  return {
    name: settings.store.name,
    short_name: settings.store.name,
    description: settings.seo.defaultDescription,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Matches the dark surface, so there is no white flash on launch.
    background_color: '#0A0A0B',
    theme_color: '#0A0A0B',
    categories: ['shopping'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
