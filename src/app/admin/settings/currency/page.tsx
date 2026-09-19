import { requirePagePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { listCurrencies } from '@/lib/services/currency.service';
import { SettingsForm } from '@/components/admin/settings-form';
import { PageHeader } from '@/components/admin/data-table';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Currency' };

export default async function CurrencySettingsPage() {
  const user = await requirePagePermission('settings:read');
  const [settings, currencies] = await Promise.all([getSettings(true), listCurrencies(true)]);

  return (
    <>
      <PageHeader
        title="Currency"
        description="Prices are stored once, in the base currency, as whole minor units. Everything a customer sees is converted on the server using these rates."
      />

      <div className="mb-6 overflow-hidden rounded-lg border border-hairline bg-surface">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-hairline text-2xs uppercase tracking-[0.08em] text-faint">
              <th className="px-4 py-3 font-medium">Currency</th>
              <th className="px-4 py-3 font-medium">Symbol</th>
              <th className="px-4 py-3 text-right font-medium">Rate per base</th>
              <th className="px-4 py-3 text-right font-medium">Decimals</th>
            </tr>
          </thead>
          <tbody>
            {currencies.map((currency) => (
              <tr key={currency.code} className="border-b border-hairline last:border-0">
                <td className="px-4 py-2.5 text-ink">
                  {currency.code} · {currency.name}
                </td>
                <td className="px-4 py-2.5 text-muted">{currency.symbol}</td>
                <td className="px-4 py-2.5 text-right tabular text-ink">{currency.rate}</td>
                <td className="px-4 py-2.5 text-right tabular text-muted">{currency.precision}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SettingsForm
        group="currency"
        initial={settings.currency as unknown as Record<string, unknown>}
        canWrite={hasPermission(user.permissions, 'settings:write')}
        sections={[
          {
            title: 'Display',
            fields: [
              {
                path: 'base',
                label: 'Base currency',
                type: 'select',
                hint: 'Prices are stored in this currency. Changing it does not re-price the catalogue.',
                options: currencies.map((currency) => ({ value: currency.code, label: currency.code })),
              },
              {
                path: 'display',
                label: 'Default display currency',
                type: 'select',
                options: currencies.map((currency) => ({ value: currency.code, label: currency.code })),
              },
              { path: 'supported', label: 'Offered to customers', type: 'list' },
              {
                path: 'mobileMoneySettlement',
                label: 'Mobile-money settlement currency',
                type: 'select',
                hint: 'Mobile money charges in a local currency; the rate used is frozen on each payment for reconciliation.',
                options: currencies.map((currency) => ({ value: currency.code, label: currency.code })),
              },
            ],
          },
        ]}
        footnote="Rates are edited directly in the currencies table (or synced from a rates provider). Conversion always happens on the server — the browser never computes a price."
      />
    </>
  );
}
