import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { RegisterForm } from '@/components/store/auth-forms';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create an account',
  robots: { index: false, follow: true },
};

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect(user.isAdmin ? '/admin' : '/account');

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-14">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <p className="eyebrow mb-2">Account</p>
          <h1 className="font-display text-3xl tracking-tight text-ink">Create your account</h1>
          <p className="mt-2.5 text-sm text-muted">You do not need an account to buy — but it makes the next order quicker.</p>
        </header>
        <div className="rounded-xl border border-hairline bg-surface p-7">
          <Suspense fallback={<div className="skeleton h-64 rounded" />}>
            <RegisterForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
