import { AlertTriangle, CheckCircle2, CreditCard, Smartphone } from 'lucide-react';
import { requirePagePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { getCurrency } from '@/lib/services/currency.service';
import { listAllDescriptors, paymentsEnvironment } from '@/lib/payments/registry';
import { PageHeader } from '@/components/admin/data-table';
import { Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payment providers' };

export default async function PaymentProvidersPage() {
  await requirePagePermission('payment:read');

  const descriptors = listAllDescriptors();
  const [volumes, currency] = await Promise.all([
    prisma.payment.groupBy({ by: ['provider', 'status'], _count: true, _sum: { amount: true } }),
    getCurrency('AED'),
  ]);

  const environment = paymentsEnvironment();

  return (
    <>
      <PageHeader
        title="Payment providers"
        description="What is connected, what is missing, and what each one has taken. Credentials live in environment variables and are never shown here — only whether they are present."
        actions={
          <Badge tone={environment === 'live' ? 'positive' : 'caution'}>
            {environment === 'live' ? 'Live mode' : 'Sandbox mode'}
          </Badge>
        }
      />

      {environment === 'sandbox' && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-caution/40 bg-caution/8 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-caution" />
          <div className="text-[13px] text-muted">
            <p className="font-medium text-caution">This store is in sandbox mode.</p>
            <p className="mt-1">
              No real money moves. Set <code className="rounded-xs bg-ink/6 px-1 font-mono text-xs">PAYMENTS_ENVIRONMENT=live</code> and
              supply live credentials to start taking payments. Sandbox and live credentials are never mixed — the
              registry refuses to start a live payment with test keys.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {descriptors.map((descriptor) => {
          const rows = volumes.filter((row) => row.provider === descriptor.id);
          const successful = rows.find((row) => row.status === 'SUCCESSFUL');
          const failed = rows
            .filter((row) => ['FAILED', 'EXPIRED', 'CANCELLED'].includes(row.status))
            .reduce((sum, row) => sum + (typeof row._count === 'number' ? row._count : 0), 0);

          return (
            <section key={descriptor.id} className="rounded-lg border border-hairline bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      descriptor.configured ? 'bg-positive/10 text-positive' : 'bg-ink/6 text-faint'
                    }`}
                  >
                    {descriptor.kind === 'CARD' ? <CreditCard className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-medium text-ink">{descriptor.displayName}</h2>
                      {descriptor.configured ? (
                        <Badge tone="positive">
                          <CheckCircle2 className="h-3 w-3" />
                          Connected
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Not configured</Badge>
                      )}
                      <Badge tone={descriptor.environment === 'live' ? 'info' : 'caution'}>
                        {descriptor.environment}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[13px] text-muted">{descriptor.blurb}</p>
                    {descriptor.configurationHint && (
                      <p className="mt-2 rounded bg-caution/8 px-3 py-2 text-xs text-caution">
                        {descriptor.configurationHint}
                      </p>
                    )}
                  </div>
                </div>

                <dl className="grid grid-cols-3 gap-5 text-right">
                  <div>
                    <dt className="text-2xs uppercase tracking-wider text-faint">Paid</dt>
                    <dd className="text-[15px] tabular text-ink">
                      {typeof successful?._count === 'number' ? successful._count : 0}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-2xs uppercase tracking-wider text-faint">Failed</dt>
                    <dd className="text-[15px] tabular text-ink">{failed}</dd>
                  </div>
                  <div>
                    <dt className="text-2xs uppercase tracking-wider text-faint">Volume</dt>
                    <dd className="text-[15px] tabular text-ink">{formatMoney(successful?._sum.amount ?? 0, currency)}</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-4 grid gap-x-8 gap-y-2 border-t border-hairline pt-4 text-xs sm:grid-cols-2">
                <Capability label="Refunds" enabled={descriptor.capabilities.refunds} />
                <Capability label="Partial refunds" enabled={descriptor.capabilities.partialRefunds} />
                <Capability label="Webhooks" enabled={descriptor.capabilities.webhooks} />
                <Capability label="Status polling" enabled={descriptor.capabilities.statusPolling} />
                <Capability label="Redirect flow" enabled={descriptor.capabilities.redirect} />
                <Capability label="Handset approval" enabled={descriptor.capabilities.asynchronousApproval} />
              </div>

              {descriptor.capabilities.webhooks && (
                <p className="mt-3 text-xs text-faint">
                  Callback URL to register with the provider:{' '}
                  <code className="rounded-xs bg-ink/6 px-1.5 py-0.5 font-mono">
                    {process.env.APP_URL || 'https://your-domain'}/api/payments/webhook/{descriptor.id}
                  </code>
                </p>
              )}
            </section>
          );
        })}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-faint">
        Adding another provider means writing one adapter against the PaymentProvider interface and listing its id in
        PAYMENTS_ENABLED. Checkout, refunds and the webhook route need no changes. See docs/PAYMENTS.md.
      </p>
    </>
  );
}

function Capability({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={enabled ? 'text-positive' : 'text-faint'}>{enabled ? 'Yes' : 'No'}</span>
    </div>
  );
}
