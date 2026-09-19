import Link from 'next/link';
import { CreditCard, Smartphone } from 'lucide-react';
import type { StoreSettings } from '@/lib/settings';
import type { NavSeries } from '@/lib/server-context';
import { NewsletterForm } from './newsletter-form';

/**
 * Footer. Everything a customer looks for at the bottom of a shop: how to
 * reach a person, how delivery and warranty work, and the legal pages — all
 * driven by content rows the merchant can edit.
 */

export function Footer({
  settings,
  series,
  paymentMethods,
}: {
  settings: StoreSettings;
  series: NavSeries[];
  paymentMethods: { id: string; displayName: string; kind: string }[];
}) {
  const year = new Date().getFullYear();

  const columns = [
    {
      title: 'Shop',
      links: [
        ['/shop', 'All devices'],
        ['/shop?availability=in-stock', 'In stock now'],
        ['/deals', 'Deals'],
        ['/shop?sort=newest', 'New arrivals'],
        ['/wishlist', 'Saved items'],
      ],
    },
    {
      title: 'iPhone series',
      links: series.slice(0, 6).map((s) => [`/shop?series=${s.slug}`, s.name] as [string, string]),
    },
    {
      title: 'Help',
      links: [
        ['/pages/delivery', 'Delivery'],
        ['/pages/warranty', 'Warranty'],
        ['/pages/returns', 'Returns & refunds'],
        ['/faq', 'FAQ'],
        ['/account/orders', 'Track an order'],
      ],
    },
    {
      title: 'Company',
      links: [
        ['/pages/about', 'About us'],
        ['/pages/terms', 'Terms & conditions'],
        ['/pages/privacy', 'Privacy policy'],
        ['/contact', 'Contact'],
      ],
    },
  ];

  return (
    <footer className="mt-24 border-t border-hairline bg-surface">
      <div className="container py-14 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2.6fr]">
          <div>
            <p className="font-display text-3xl tracking-[0.18em] text-ink">{settings.store.name}</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">{settings.store.tagline}</p>

            <div className="mt-7">
              <p className="eyebrow mb-2.5">Stay in touch</p>
              <NewsletterForm />
            </div>

            <div className="mt-8 space-y-1 text-[13px] text-muted">
              <p>{settings.store.addressLine}</p>
              <p>
                {settings.store.city}, {settings.store.country}
              </p>
              <p className="pt-2">
                <a href={`mailto:${settings.store.email}`} className="hover:text-ink">
                  {settings.store.email}
                </a>
              </p>
              <p>
                <a href={`tel:${settings.store.phone.replace(/\s/g, '')}`} className="hover:text-ink">
                  {settings.store.phone}
                </a>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="eyebrow mb-3.5">{column.title}</p>
                <ul className="space-y-2.5">
                  {column.links.map(([href, label]) => (
                    <li key={href}>
                      <Link href={href} className="text-[13px] text-muted transition-colors hover:text-ink">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {settings.trust.showPaymentBadges && paymentMethods.length > 0 && (
          <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-hairline pt-8">
            <span className="eyebrow">We accept</span>
            {paymentMethods.map((method) => (
              <span
                key={method.id}
                className="inline-flex items-center gap-2 rounded border border-hairline px-3 py-1.5 text-xs text-muted"
              >
                {method.kind === 'CARD' ? (
                  <CreditCard className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Smartphone className="h-3.5 w-3.5" aria-hidden />
                )}
                {method.displayName}
              </span>
            ))}
          </div>
        )}

        <div className="mt-10 flex flex-col gap-4 border-t border-hairline pt-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-faint">
            © {year} {settings.store.legalName}. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-5">
            {settings.store.socials.map((social) => (
              <a
                key={social.href}
                href={social.href}
                rel="noopener noreferrer nofollow"
                target="_blank"
                className="text-xs text-faint transition-colors hover:text-ink"
              >
                {social.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
