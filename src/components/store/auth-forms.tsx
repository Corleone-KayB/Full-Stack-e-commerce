'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, apiPatch, apiPost, errorMessage } from '@/lib/client-api';
import { Button, Checkbox, Field, Input } from '@/components/ui';
import { useToast } from '@/components/providers';

/**
 * Authentication forms.
 *
 * The sign-in error is deliberately the same whether the email is unknown or
 * the password is wrong, and the reset form always reports success — neither
 * should tell an attacker which addresses have accounts.
 */

function useAuthSubmit() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const run = React.useCallback(async (action: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      await action();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldErrors(caught.fieldErrors);
        setError(caught.message);
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, fieldErrors, run };
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded border border-critical/40 bg-critical/8 px-3.5 py-2.5" role="alert">
      <p className="text-[13px] text-critical">{message}</p>
    </div>
  );
}

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/account';
  const { loading, error, run } = useAuthSubmit();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          const user = await apiPost<{ isAdmin: boolean }>('/api/auth/login', { email, password });
          router.push(user.isAdmin && next === '/account' ? '/admin' : next);
          router.refresh();
        });
      }}
    >
      <FormError message={error} />

      <Field label="Email address" required htmlFor="signin-email">
        <Input
          id="signin-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      <Field label="Password" required htmlFor="signin-password">
        <Input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">
          Forgotten your password?
        </Link>
      </div>

      <Button type="submit" size="lg" className="w-full" loading={loading} loadingLabel="Signing in…">
        Sign in
      </Button>

      <p className="text-center text-[13px] text-muted">
        New here?{' '}
        <Link href="/register" className="text-accent underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const { loading, error, fieldErrors, run } = useAuthSubmit();
  const [form, setForm] = React.useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    marketingOptIn: false,
  });

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          await apiPost('/api/auth/register', {
            ...form,
            phone: form.phone || undefined,
          });
          router.push('/account');
          router.refresh();
        });
      }}
    >
      <FormError message={error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required error={fieldErrors.firstName}>
          <Input autoComplete="given-name" required value={form.firstName} onChange={set('firstName')} />
        </Field>
        <Field label="Last name" required error={fieldErrors.lastName}>
          <Input autoComplete="family-name" required value={form.lastName} onChange={set('lastName')} />
        </Field>
      </div>

      <Field label="Email address" required error={fieldErrors.email}>
        <Input type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
      </Field>

      <Field label="Mobile number" error={fieldErrors.phone} hint="Optional — used for delivery updates.">
        <Input type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
      </Field>

      <Field
        label="Password"
        required
        error={fieldErrors.password}
        hint="At least 10 characters, with upper and lower case and a number."
      >
        <Input type="password" autoComplete="new-password" required value={form.password} onChange={set('password')} />
      </Field>

      <Checkbox
        label="Email me occasionally about stock and offers"
        checked={form.marketingOptIn}
        onChange={set('marketingOptIn')}
      />

      <Button type="submit" size="lg" className="w-full" loading={loading} loadingLabel="Creating your account…">
        Create account
      </Button>

      <p className="text-center text-[13px] text-muted">
        Already have an account?{' '}
        <Link href="/signin" className="text-accent underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { loading, error, run } = useAuthSubmit();
  const [email, setEmail] = React.useState('');
  const [sent, setSent] = React.useState(false);

  if (sent) {
    return (
      <div className="rounded-lg border border-hairline bg-surface p-6 text-center">
        <p className="text-[15px] text-ink">Check your inbox</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          If an account exists for {email}, a reset link is on its way. It is valid for one hour.
        </p>
        <Link href="/signin" className="mt-5 inline-block text-[13px] text-accent underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          await apiPost('/api/auth/password', { email });
          setSent(true);
        });
      }}
    >
      <FormError message={error} />
      <Field label="Email address" required htmlFor="reset-email">
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading} loadingLabel="Sending…">
        Send reset link
      </Button>
      <p className="text-center text-[13px] text-muted">
        <Link href="/signin" className="underline underline-offset-4 hover:text-ink">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const { loading, error, fieldErrors, run } = useAuthSubmit();
  const [password, setPassword] = React.useState('');
  const toast = useToast();

  if (!token) {
    return (
      <div className="rounded-lg border border-caution/40 bg-caution/8 p-5">
        <p className="text-sm text-caution">
          This link is missing its token. Request a new one from the{' '}
          <Link href="/forgot-password" className="underline underline-offset-4">
            reset page
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          await apiPatch('/api/auth/password', { token, password });
          toast.success('Password changed', 'Sign in with your new password.');
          router.push('/signin');
        });
      }}
    >
      <FormError message={error} />
      <Field
        label="New password"
        required
        error={fieldErrors.password}
        hint="At least 10 characters, with upper and lower case and a number."
        htmlFor="new-password"
      >
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading} loadingLabel="Saving…">
        Set new password
      </Button>
      <p className="text-center text-2xs text-faint">
        Setting a new password signs you out everywhere else.
      </p>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        await apiPost('/api/auth/logout').catch(() => undefined);
        router.push('/');
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
