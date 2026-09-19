import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { SignInForm } from '@/components/store/auth-forms';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: true },
};

export default async function SignInPage() {
  const user = await getSessionUser();
  if (user) redirect(user.isAdmin ? '/admin' : '/account');

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-14">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <p className="eyebrow mb-2">Account</p>
          <h1 className="font-display text-3xl tracking-tight text-ink">Welcome back</h1>
          <p className="mt-2.5 text-sm text-muted">Track orders, save addresses and check out faster.</p>
        </header>
        <div className="rounded-xl border border-hairline bg-surface p-7">
          <Suspense fallback={<div className="skeleton h-64 rounded" />}>
            <SignInForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
