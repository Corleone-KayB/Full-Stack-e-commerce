'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock, Smartphone, XCircle } from 'lucide-react';
import { apiGet, errorMessage } from '@/lib/client-api';
import { useCart } from '@/components/providers';
import { Button, LinkButton } from '@/components/ui';
import type { PaymentStatus } from '@/types/enums';

/**
 * Payment waiting screen.
 *
 * The customer must never be left wondering whether their money has moved.
 * The screen polls the server (which re-verifies with the provider on every
 * poll), shows the elapsed time against the expiry, and gives an explicit
 * outcome — with a retry path that keeps the order intact.
 */

interface PollResult {
  status: PaymentStatus;
  orderNumber: string;
  orderStatus: string;
  failureMessage: string | null;
  expiresAt: string | null;
}

const TERMINAL: PaymentStatus[] = ['SUCCESSFUL', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'];

export function PaymentWaiting() {
  const params = useSearchParams();
  const router = useRouter();
  const reference = params.get('ref');
  const { refresh } = useCart();

  const [result, setResult] = React.useState<PollResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    let attempt = 0;

    async function poll() {
      try {
        const next = await apiGet<PollResult>(`/api/payments/${reference}`);
        if (cancelled) return;
        setResult(next);

        if (TERMINAL.includes(next.status)) {
          await refresh();
          if (next.status === 'SUCCESSFUL') {
            // Give the success state a beat to register, then move on.
            setTimeout(() => router.replace(`/order/${next.orderNumber}`), 1400);
          }
          return;
        }
      } catch (pollError) {
        if (!cancelled) setError(errorMessage(pollError));
      }

      attempt += 1;
      // Back off gently: quick at first, then every few seconds.
      const delay = attempt < 5 ? 2000 : attempt < 20 ? 3000 : 5000;
      if (!cancelled) setTimeout(poll, delay);
    }

    void poll();
    const ticker = setInterval(() => setElapsed((value) => value + 1), 1000);

    return () => {
      cancelled = true;
      clearInterval(ticker);
    };
  }, [reference, router, refresh]);

  if (!reference) {
    return (
      <Panel
        icon={<AlertCircle className="h-6 w-6" />}
        tone="caution"
        title="Nothing to show here"
        body="This page needs a payment reference. If you were paying for an order, check your email for the confirmation."
        actions={<LinkButton href="/shop">Continue shopping</LinkButton>}
      />
    );
  }

  if (error && !result) {
    return (
      <Panel
        icon={<AlertCircle className="h-6 w-6" />}
        tone="critical"
        title="We lost the connection"
        body={`${error} Your order is safe — refresh to check again.`}
        actions={<Button onClick={() => window.location.reload()}>Check again</Button>}
      />
    );
  }

  const status = result?.status ?? 'PENDING';

  if (status === 'SUCCESSFUL') {
    return (
      <Panel
        icon={<CheckCircle2 className="h-6 w-6" />}
        tone="positive"
        title="Payment received"
        body={`Order ${result?.orderNumber} is confirmed. Taking you to your receipt…`}
        actions={<LinkButton href={`/order/${result?.orderNumber}`}>View order</LinkButton>}
      />
    );
  }

  if (status === 'FAILED' || status === 'CANCELLED') {
    return (
      <Panel
        icon={<XCircle className="h-6 w-6" />}
        tone="critical"
        title="Payment wasn't completed"
        body={
          result?.failureMessage ??
          'Nothing has been charged. Your order is saved, so you can try again or use a different method.'
        }
        actions={
          <>
            <LinkButton href="/checkout">Try again</LinkButton>
            <LinkButton href="/cart" variant="secondary">
              Back to bag
            </LinkButton>
          </>
        }
        footer={
          result?.orderNumber ? (
            <>
              Your order reference is <span className="text-ink">{result.orderNumber}</span> — quote it if you contact us.
            </>
          ) : null
        }
      />
    );
  }

  if (status === 'EXPIRED') {
    return (
      <Panel
        icon={<Clock className="h-6 w-6" />}
        tone="caution"
        title="The request timed out"
        body="We did not receive a confirmation in time, so the reserved stock has been released. You can place the order again."
        actions={
          <>
            <LinkButton href="/checkout">Start again</LinkButton>
            <LinkButton href="/shop" variant="secondary">
              Keep shopping
            </LinkButton>
          </>
        }
      />
    );
  }

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <Panel
      icon={
        <span className="relative flex h-6 w-6 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-accent/40" aria-hidden />
          <Smartphone className="relative h-6 w-6" />
        </span>
      }
      tone="accent"
      title="Waiting for you to approve"
      body="Check your handset and approve the payment request. This page updates by itself — there is no need to refresh."
      actions={
        <LinkButton href="/checkout" variant="secondary">
          Choose another method
        </LinkButton>
      }
      footer={
        <>
          Waiting {minutes > 0 ? `${minutes}m ` : ''}
          {seconds}s{result?.orderNumber ? ` · Order ${result.orderNumber}` : ''}
        </>
      }
    />
  );
}

function Panel({
  icon,
  tone,
  title,
  body,
  actions,
  footer,
}: {
  icon: React.ReactNode;
  tone: 'accent' | 'positive' | 'critical' | 'caution';
  title: string;
  body: string;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const tones = {
    accent: 'bg-accent/10 text-accent',
    positive: 'bg-positive/10 text-positive',
    critical: 'bg-critical/10 text-critical',
    caution: 'bg-caution/10 text-caution',
  } as const;

  return (
    <div
      className="w-full max-w-md rounded-xl border border-hairline bg-surface p-8 text-center shadow-subtle"
      role="status"
      aria-live="polite"
    >
      <span className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full ${tones[tone]}`}>
        {icon}
      </span>
      <h1 className="font-display text-2xl tracking-tight text-ink">{title}</h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">{body}</p>
      {actions && <div className="mt-7 flex flex-wrap justify-center gap-3">{actions}</div>}
      {footer && <p className="mt-6 text-xs tabular text-faint">{footer}</p>}
      <p className="mt-6 border-t border-hairline pt-5 text-2xs text-faint">
        Having trouble?{' '}
        <Link href="/contact" className="text-accent underline underline-offset-4">
          Contact us
        </Link>
      </p>
    </div>
  );
}
