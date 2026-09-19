import type { Metadata } from 'next';
import Link from 'next/link';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { getSettings } from '@/lib/settings';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Talk to a person about an order, a device or a warranty claim.',
  alternates: { canonical: '/contact' },
};

export default async function ContactPage() {
  const settings = await getSettings();

  return (
    <div className="container max-w-4xl py-12 lg:py-16">
      <header className="mb-10 max-w-xl">
        <p className="eyebrow mb-2">Support</p>
        <h1 className="font-display text-headline text-ink">Talk to us</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Questions about an order, a device or a warranty claim reach a person, not a queue. We answer within one
          working day.
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card
          icon={<Mail className="h-4 w-4" />}
          title="Email"
          body={settings.store.email}
          href={`mailto:${settings.store.email}`}
        />
        <Card
          icon={<Phone className="h-4 w-4" />}
          title="Phone"
          body={settings.store.phone}
          href={`tel:${settings.store.phone.replace(/\s/g, '')}`}
        />
        <Card
          icon={<MapPin className="h-4 w-4" />}
          title="Counter"
          body={`${settings.store.addressLine}, ${settings.store.city}`}
        />
        <Card
          icon={<Clock className="h-4 w-4" />}
          title="Hours"
          body="Sunday to Thursday, 10:00 – 19:00 (GST)"
        />
      </div>

      <div className="mt-10 rounded-xl border border-hairline bg-surface p-7">
        <h2 className="font-display text-2xl tracking-tight text-ink">Before you write</h2>
        <p className="mt-2 text-sm text-muted">Most questions are answered faster on these pages:</p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          {[
            ['/faq', 'FAQ'],
            ['/pages/delivery', 'Delivery'],
            ['/pages/warranty', 'Warranty'],
            ['/pages/returns', 'Returns'],
            ['/account/orders', 'Track an order'],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-xs border border-hairline px-3.5 py-2 text-[13px] text-muted transition-colors hover:border-accent hover:text-accent"
            >
              {label}
            </Link>
          ))}
        </div>
        <p className="mt-6 text-[13px] text-muted">
          If you are writing about an order, include the order number (it looks like <span className="tabular text-ink">ORD-20260912-0001</span>) so we can pull it up straight away.
        </p>
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  body,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
        {icon}
      </span>
      <p className="eyebrow mb-1">{title}</p>
      <p className="text-[15px] text-ink">{body}</p>
    </>
  );

  return href ? (
    <a
      href={href}
      className="rounded-xl border border-hairline bg-surface p-6 transition-colors hover:border-ink/25"
    >
      {content}
    </a>
  ) : (
    <div className="rounded-xl border border-hairline bg-surface p-6">{content}</div>
  );
}
