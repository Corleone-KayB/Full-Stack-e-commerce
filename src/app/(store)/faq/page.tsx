import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Accordion } from '@/components/ui';
import { groupBy } from '@/lib/utils';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Frequently asked questions',
  description: 'Warranty, delivery, payment and returns — answered.',
  alternates: { canonical: '/faq' },
};

const TOPIC_LABELS: Record<string, string> = {
  general: 'General',
  products: 'Devices & condition',
  payment: 'Payment',
  delivery: 'Delivery',
  warranty: 'Warranty',
  returns: 'Returns',
};

export default async function FaqPage() {
  const faqs = await prisma.faq
    .findMany({ where: { active: true }, orderBy: [{ topic: 'asc' }, { position: 'asc' }] })
    .catch(() => []);

  const grouped = groupBy(faqs, (faq) => faq.topic);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <div className="container max-w-3xl py-12 lg:py-16">
        <header className="mb-10">
          <p className="eyebrow mb-2">Help</p>
          <h1 className="font-display text-headline text-ink">Frequently asked questions</h1>
        </header>

        {Object.entries(grouped).map(([topic, items]) => (
          <section key={topic} className="mb-10">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-[0.1em] text-muted">
              {TOPIC_LABELS[topic] ?? topic}
            </h2>
            <Accordion items={items.map((faq) => ({ id: faq.id, question: faq.question, answer: faq.answer }))} />
          </section>
        ))}

        <div className="rounded-xl border border-hairline bg-surface p-7 text-center">
          <p className="text-[15px] text-ink">Still not sure?</p>
          <p className="mt-1.5 text-sm text-muted">We answer messages within a working day.</p>
          <Link
            href="/contact"
            className="mt-5 inline-flex h-11 items-center rounded bg-ink px-6 text-sm font-medium text-canvas"
          >
            Contact us
          </Link>
        </div>
      </div>
    </>
  );
}
