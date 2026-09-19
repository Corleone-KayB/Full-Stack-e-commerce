import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { initials } from '@/lib/utils';
import { SignOutButton } from '@/components/store/auth-forms';

export const dynamic = 'force-dynamic';

const LINKS = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/wishlist', label: 'Saved items' },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/signin?next=/account');

  return (
    <div className="container py-10 lg:py-14">
      <header className="mb-9 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/12 font-medium text-accent">
            {initials(user.firstName, user.lastName, user.email)}
          </span>
          <div>
            <h1 className="font-display text-2xl tracking-tight text-ink">
              {user.firstName ? `Hello, ${user.firstName}` : 'Your account'}
            </h1>
            <p className="text-sm text-muted">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {user.isAdmin && (
            <Link
              href="/admin"
              className="rounded border border-hairline px-3.5 py-2 text-[13px] text-muted transition-colors hover:border-accent hover:text-accent"
            >
              Admin dashboard
            </Link>
          )}
          <SignOutButton />
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[200px_1fr] lg:gap-14">
        <nav aria-label="Account" className="lg:border-r lg:border-hairline lg:pr-6">
          <ul className="no-scrollbar flex gap-1 overflow-x-auto lg:flex-col">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block whitespace-nowrap rounded px-3.5 py-2.5 text-[13px] text-muted transition-colors hover:bg-ink/5 hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
