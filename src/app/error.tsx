'use client';

import * as React from 'react';
import Link from 'next/link';

/**
 * Global error boundary.
 *
 * Shows the digest — the id our server logged the failure under — and nothing
 * else. A stack trace or a driver message must never reach a customer.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    // The server has already logged this; this is only for browser telemetry.
    console.error('Unhandled UI error', error.digest ?? '');
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 text-center">
      <p className="eyebrow mb-3">Something went wrong</p>
      <h1 className="font-display text-4xl tracking-tight text-ink">We hit an unexpected problem</h1>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
        Nothing you were doing has been lost. Try again, and if it keeps happening please get in touch.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center rounded bg-ink px-6 text-sm font-medium text-canvas"
        >
          Try again
        </button>
        <Link
          href="/contact"
          className="inline-flex h-11 items-center rounded border border-ink/25 px-6 text-sm font-medium text-ink"
        >
          Contact us
        </Link>
      </div>
      {error.digest && <p className="mt-8 text-2xs tabular text-faint">Reference {error.digest}</p>}
    </div>
  );
}
