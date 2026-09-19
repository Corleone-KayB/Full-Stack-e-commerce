import { CreditCard, Lock, Smartphone } from 'lucide-react';
import type { ProviderDescriptor } from '@/lib/payments/types';

/**
 * Payment methods, listed from the provider registry rather than hard-coded
 * logos — so what a customer sees is exactly what checkout will offer.
 */
export function PaymentMethodsPanel({ providers }: { providers: ProviderDescriptor[] }) {
  /**
   * The homepage lists live methods only, so on a sandbox store this list is
   * empty while checkout still works through the test wallet. Saying "no
   * payment provider is connected — add credentials in the admin" would be
   * both a contradiction a shopper can disprove in two clicks and a line of
   * operator instructions on a customer-facing page. The honest version says
   * what a shopper can act on and leaves the configuring to the admin, which
   * is where the warning belongs and already appears.
   */
  if (!providers.length) {
    return (
      <p className="rounded-lg border border-hairline bg-canvas p-5 text-[13px] leading-relaxed text-muted">
        Payment methods are confirmed at checkout. If you would rather arrange payment directly, get in touch and we
        will take your order.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {providers.map((provider) => (
        <div key={provider.id} className="flex items-start gap-4 rounded-lg border border-hairline bg-canvas p-5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            {provider.kind === 'CARD' ? <CreditCard className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-medium tracking-tight text-ink">{provider.displayName}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{provider.blurb}</p>
          </div>
        </div>
      ))}
      <p className="flex items-center gap-2 pt-1 text-xs text-faint">
        <Lock className="h-3.5 w-3.5" aria-hidden />
        Card details are entered on our processor&rsquo;s page, never on this site.
      </p>
    </div>
  );
}
