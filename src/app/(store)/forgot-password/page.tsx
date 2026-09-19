import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ForgotPasswordForm } from '@/components/store/auth-forms';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: true },
};

export default async function ForgotPasswordPage() {
  // Someone already signed in has no business in the password-reset flow —
  // they can change it in their account. Mirrors the guard on /signin.
  const user = await getSessionUser();
  if (user) redirect(user.isAdmin ? '/admin' : '/account');

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-14">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <p className="eyebrow mb-2">Account</p>
          <h1 className="font-display text-3xl tracking-tight text-ink">Reset your password</h1>
          <p className="mt-2.5 text-sm text-muted">We will email you a link to choose a new one.</p>
        </header>
        <div className="rounded-xl border border-hairline bg-surface p-7">
          <Suspense fallback={<div className="skeleton h-64 rounded" />}>
            <ForgotPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
