import { requirePagePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { SettingsForm } from '@/components/admin/settings-form';
import { PageHeader } from '@/components/admin/data-table';
import { Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications' };

export default async function NotificationSettingsPage() {
  const user = await requirePagePermission('settings:read');
  const [settings, templates, recent] = await Promise.all([
    getSettings(true),
    prisma.notificationTemplate.findMany({ orderBy: { key: 'asc' } }),
    prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Which emails go out, and the templates behind them. The default driver logs instead of sending, so a fresh install never emails a real customer by accident."
      />

      <SettingsForm
        group="notifications"
        initial={settings.notifications as unknown as Record<string, unknown>}
        canWrite={hasPermission(user.permissions, 'settings:write')}
        sections={[
          {
            title: 'Customer emails',
            fields: [
              { path: 'orderConfirmationEmail', label: 'Order confirmation', type: 'boolean' },
              { path: 'paymentReceiptEmail', label: 'Payment receipt', type: 'boolean' },
              { path: 'statusChangeEmail', label: 'Order status changes', type: 'boolean' },
            ],
          },
          {
            title: 'Internal',
            fields: [
              {
                path: 'adminOrderAlertTo',
                label: 'Send new-order alerts to',
                type: 'text',
                hint: 'Leave blank for no internal alert.',
                wide: true,
              },
            ],
          },
        ]}
      />

      <div className="mt-8 grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-hairline bg-surface p-5">
          <h2 className="mb-4 text-sm font-medium text-ink">Templates</h2>
          <ul className="divide-y divide-hairline text-[13px]">
            {templates.map((template) => (
              <li key={template.id} className="py-2.5">
                <p className="font-mono text-xs text-muted">{template.key}</p>
                <p className="text-ink">{template.subject ?? '—'}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-faint">
            Placeholders such as {'{{orderNumber}}'} and {'{{total}}'} are substituted when the message is queued.
          </p>
        </section>

        <section className="rounded-lg border border-hairline bg-surface p-5">
          <h2 className="mb-4 text-sm font-medium text-ink">Recently queued</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted">Nothing has been sent yet.</p>
          ) : (
            <ul className="divide-y divide-hairline text-[13px]">
              {recent.map((notification) => (
                <li key={notification.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{notification.subject ?? notification.templateKey}</span>
                    <span className="block truncate text-xs text-muted">{notification.toAddress}</span>
                  </span>
                  <Badge tone={notification.status === 'SENT' ? 'positive' : notification.status === 'FAILED' ? 'critical' : 'caution'}>
                    {notification.status.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
