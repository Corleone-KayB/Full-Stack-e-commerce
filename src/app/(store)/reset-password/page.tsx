import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ResetPasswordForm } from '@/components/store/auth-forms';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: true },
};

export default async function ResetPasswordPage() {
  // Someone already signed in has no business in the password-reset flow —
  // they can change it in their account. Mirrors the guard on /signin.
  const user = await getSessionUser();
  if (user) redirect(user.isAdmin ? '/admin' : '/account');

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-14">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <p className="eyebrow mb-2">Account</p>
          <h1 className="font-display text-3xl tracking-tight text-ink">Choose a new password</h1>
          <p className="mt-2.5 text-sm text-muted">Pick something you have not used elsewhere.</p>
        </header>
        <div className="rounded-xl border border-hairline bg-surface p-7">
          <Suspense fallback={<div className="skeleton h-64 rounded" />}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
