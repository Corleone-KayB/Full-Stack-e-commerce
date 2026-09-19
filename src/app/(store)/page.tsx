import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { getRequestedCurrency, getStorefrontContext } from '@/lib/server-context';
import { listCurated } from '@/lib/services/catalog.service';
import { listAvailableDescriptors } from '@/lib/payments/registry';
import { Hero, ProductRail, SectionHeading, SeriesGrid, TrustRow } from '@/components/store/sections';
import { Accordion, LinkButton } from '@/components/ui';
import { PaymentMethodsPanel } from '@/components/store/payment-methods-panel';

export const revalidate = 120;

export default async function HomePage() {
  const currency = await getRequestedCurrency();
  const [settings, context, featured, bestsellers, newest, deals, faqs] = await Promise.all([
    getSettings(),
    getStorefrontContext(),
    listCurated('featured', 4, currency ?? undefined),
    listCurated('bestseller', 4, currency ?? undefined),
    listCurated('new', 4, currency ?? undefined),
    listCurated('deals', 4, currency ?? undefined),
    prisma.faq.findMany({ where: { active: true }, orderBy: { position: 'asc' }, take: 6 }).catch(() => []),
  ]);

  const heroProduct = featured[0] ?? bestsellers[0] ?? null;
  const providers = listAvailableDescriptors().filter((p) => p.kind !== 'TEST');

  return (
    <>
      <Hero
        settings={settings}
        image={heroProduct?.image ? { url: heroProduct.image.url, alt: heroProduct.image.alt } : null}
      />

      {featured.length > 0 && (
        <section className="container py-16 lg:py-20">
          <SectionHeading
            eyebrow="Featured"
            title={settings.homepage.featuredHeading}
            body={settings.homepage.featuredSubheading}
            href="/shop"
          />
          <ProductRail products={featured} priority />
        </section>
      )}

      <section className="border-y border-hairline bg-surface">
        <div className="container py-14 lg:py-16">
          <TrustRow statements={settings.trust.statements} />
        </div>
      </section>

      {bestsellers.length > 0 && (
        <section className="container py-16 lg:py-20">
          <SectionHeading
            eyebrow="Best sellers"
            title="What people are buying"
            body="Ranked by units sold over the last 90 days."
            href="/shop?sort=bestselling"
          />
          <ProductRail products={bestsellers} />
        </section>
      )}

      {deals.length > 0 && (
        <section className="border-y border-hairline bg-surface">
          <div className="container py-16 lg:py-20">
            <SectionHeading
              eyebrow="Limited"
              title="On promotion now"
              body="Scheduled offers, live until they expire — no permanent fake discounts."
              href="/deals"
            />
            <ProductRail products={deals} />
          </div>
        </section>
      )}

      <section className="container py-16 lg:py-20">
        <SectionHeading eyebrow="Browse" title="Shop by series" href="/shop" hrefLabel="See everything" />
        <SeriesGrid series={context.series} />
      </section>

      {newest.length > 0 && (
        <section className="container pb-16 lg:pb-20">
          <SectionHeading eyebrow="Just landed" title="New arrivals" href="/shop?sort=newest" />
          <ProductRail products={newest} />
        </section>
      )}

      <section className="border-y border-hairline bg-surface">
        <div className="container grid gap-12 py-16 lg:grid-cols-2 lg:py-20">
          <div>
            <SectionHeading
              eyebrow="Payment"
              title="Pay the way that suits you"
              body={settings.payments.securityCopy}
            />
            <PaymentMethodsPanel providers={providers} />
          </div>

          <div>
            <SectionHeading eyebrow="Delivery" title="Getting it to you" />
            <div className="space-y-5">
              {[
                ['Order by 4pm', 'Same-day dispatch on working days.'],
                ['Dubai & Sharjah', 'Next working day.'],
                ['Rest of the UAE', 'One to three working days.'],
                ['Collection', settings.delivery.pickupAddress ?? 'Available at our counter.'],
              ].map(([label, body]) => (
                <div key={label} className="flex gap-5 border-b border-hairline pb-5 last:border-0">
                  <span className="w-32 shrink-0 text-[13px] font-medium text-ink">{label}</span>
                  <span className="text-[13px] leading-relaxed text-muted">{body}</span>
                </div>
              ))}
            </div>
            <Link
              href="/pages/delivery"
              className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent underline-offset-4 hover:underline"
            >
              Full delivery terms
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {faqs.length > 0 && (
        <section className="container py-16 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <SectionHeading eyebrow="Questions" title="Before you buy" href="/faq" hrefLabel="All questions" />
            <Accordion
              items={faqs.map((faq) => ({ id: faq.id, question: faq.question, answer: faq.answer }))}
              defaultOpen={faqs[0]?.id}
            />
          </div>
        </section>
      )}

      <section className="container pb-20">
        <div className="relative overflow-hidden rounded-xl border border-hairline bg-surface px-8 py-14 text-center lg:py-20">
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute left-1/2 top-0 h-[380px] w-[680px] -translate-x-1/2 rounded-full bg-accent/10 blur-[100px]" />
          </div>
          <div className="relative mx-auto max-w-lg">
            <h2 className="font-display text-headline text-ink">Not sure which one?</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Tell us your budget and what you use your phone for, and we will recommend two options — no upsell.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <LinkButton href="/contact" size="lg">
                Ask us
              </LinkButton>
              <LinkButton href="/shop" size="lg" variant="outline">
                Browse everything
              </LinkButton>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
