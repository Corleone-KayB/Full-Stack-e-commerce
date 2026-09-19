'use client';

import * as React from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client-api';
import { Input } from '@/components/ui';

/**
 * Newsletter sign-up. Posts to a real endpoint that records the address
 * against a marketing-consent flag — no silent no-op button.
 */
export function NewsletterForm() {
  const [email, setEmail] = React.useState('');
  const [state, setState] = React.useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = React.useState('');

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setState('sending');
    try {
      await apiPost('/api/newsletter', { email: email.trim() });
      setState('done');
      setMessage('Thank you — you are on the list.');
      setEmail('');
    } catch (error) {
      setState('error');
      setMessage(errorMessage(error));
    }
  }

  if (state === 'done') {
    return (
      <p className="flex items-center gap-2 text-[13px] text-positive" role="status">
        <Check className="h-4 w-4" />
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="newsletter-email">
          Email address
        </label>
        <Input
          id="newsletter-email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-10 flex-1"
        />
        <button
          type="submit"
          disabled={state === 'sending'}
          aria-label="Subscribe"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-hairline
                     text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {state === 'error' && (
        <p className="text-xs text-critical" role="alert">
          {message}
        </p>
      )}
      <p className="text-2xs text-faint">Occasional emails about stock and offers. Unsubscribe any time.</p>
    </form>
  );
}
