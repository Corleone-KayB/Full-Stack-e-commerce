import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { Prose } from '@/components/store/prose';

type Params = Promise<{ slug: string }>;

export const revalidate = 600;

export async function generateStaticParams() {
  const pages = await prisma.contentPage.findMany({ where: { active: true }, select: { slug: true } }).catch(() => []);
  return pages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const page = await prisma.contentPage.findFirst({ where: { slug, active: true } }).catch(() => null);
  if (!page) return { title: 'Page not found' };
  return {
    title: page.metaTitle ?? page.title,
    description: page.metaDescription ?? undefined,
    alternates: { canonical: `/pages/${page.slug}` },
  };
}

/** Merchant-editable content: terms, privacy, returns, delivery, warranty. */
export default async function ContentPageRoute({ params }: { params: Params }) {
  const { slug } = await params;
  const page = await prisma.contentPage.findFirst({ where: { slug, active: true } }).catch(() => null);
  if (!page) notFound();

  return (
    <div className="container max-w-3xl py-12 lg:py-16">
      <header className="mb-9 border-b border-hairline pb-8">
        <h1 className="font-display text-headline text-ink">{page.title}</h1>
        <p className="mt-3 text-xs text-faint">
          Last updated{' '}
          {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(page.updatedAt)}
        </p>
      </header>
      <Prose content={page.body} />
    </div>
  );
}
