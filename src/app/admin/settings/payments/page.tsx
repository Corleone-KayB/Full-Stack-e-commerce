import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { listAllDescriptors, paymentsEnvironment } from '@/lib/payments/registry';
import { SettingsForm } from '@/components/admin/settings-form';
import { PageHeader } from '@/components/admin/data-table';
import { Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payment settings' };

export default async function PaymentSettingsPage() {
  const user = await requirePagePermission('settings:read');
  const settings = await getSettings(true);
  const canWrite = hasPermission(user.permissions, 'payment:configure');
  const descriptors = listAllDescriptors();

  return (
    <>
      <PageHeader
        title="Payments"
        description="Which methods checkout offers, and the security wording customers see."
        actions={<Badge tone={paymentsEnvironment() === 'live' ? 'positive' : 'caution'}>{paymentsEnvironment()}</Badge>}
      />

      <div className="mb-6 rounded-lg border border-hairline bg-surface p-5">
        <h2 className="text-sm font-medium text-ink">Credentials</h2>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
          API keys are never stored in the database or shown in this admin. They are read from environment variables on
          the server, which is what keeps them out of backups, logs and the browser. Set them where your app is
          deployed, then restart.
        </p>
        <ul className="mt-4 space-y-2 text-[13px]">
          {descriptors.map((descriptor) => (
            <li key={descriptor.id} className="flex items-center justify-between gap-4 border-b border-hairline pb-2 last:border-0">
              <span className="text-ink">{descriptor.displayName}</span>
              <span className="flex items-center gap-2">
                {descriptor.configured ? (
                  <Badge tone="positive">Credentials present</Badge>
                ) : (
                  <Badge tone="neutral">Missing</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
        <Link
          href="/admin/payments/providers"
          className="mt-4 inline-block text-[13px] text-accent underline underline-offset-4"
        >
          Provider status and callback URLs
        </Link>
      </div>

      <SettingsForm
        group="payments"
        initial={settings.payments as unknown as Record<string, unknown>}
        canWrite={canWrite}
        sections={[
          {
            title: 'Checkout',
            description: 'Only providers that are both listed here and configured will appear at checkout.',
            fields: [
              {
                path: 'enabled',
                label: 'Enabled providers',
                type: 'list',
                hint: `Available: ${descriptors.map((d) => d.id).join(', ')}`,
              },
              { path: 'securityCopy', label: 'Security note shown at checkout', type: 'textarea', wide: true },
            ],
          },
        ]}
        footnote="Sandbox and live credentials are never mixed: the provider registry refuses to start a live payment with test keys, and the sandbox wallet is disabled entirely when PAYMENTS_ENVIRONMENT is live."
      />
    </>
  );
}
