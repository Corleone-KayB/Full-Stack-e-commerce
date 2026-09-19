import { requirePagePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { SettingsForm } from '@/components/admin/settings-form';
import { PageHeader } from '@/components/admin/data-table';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Store settings' };

export default async function StoreSettingsPage() {
  const user = await requirePagePermission('settings:read');
  const settings = await getSettings(true);
  const canWrite = hasPermission(user.permissions, 'settings:write');

  return (
    <>
      <PageHeader
        title="Store"
        description="Identity, contact details and the copy on the storefront. Everything here is content, not code."
      />

      <SettingsForm
        group="store"
        initial={settings.store as unknown as Record<string, unknown>}
        canWrite={canWrite}
        sections={[
          {
            title: 'Identity',
            fields: [
              { path: 'name', label: 'Store name', type: 'text' },
              { path: 'legalName', label: 'Legal entity', type: 'text' },
              { path: 'tagline', label: 'Tagline', type: 'text', wide: true },
              { path: 'logoUrl', label: 'Logo URL', type: 'text' },
              { path: 'faviconUrl', label: 'Favicon URL', type: 'text' },
            ],
          },
          {
            title: 'Contact',
            description: 'Shown in the footer, on the contact page and in emails.',
            fields: [
              { path: 'email', label: 'Support email', type: 'text' },
              { path: 'phone', label: 'Phone', type: 'text' },
              { path: 'whatsapp', label: 'WhatsApp', type: 'text' },
              { path: 'addressLine', label: 'Address', type: 'text' },
              { path: 'city', label: 'City', type: 'text' },
              { path: 'country', label: 'Country', type: 'text' },
            ],
          },
        ]}
      />

      <div className="mt-8">
        <HomepageAndTrust settings={settings} canWrite={canWrite} />
      </div>
    </>
  );
}

function HomepageAndTrust({
  settings,
  canWrite,
}: {
  settings: Awaited<ReturnType<typeof getSettings>>;
  canWrite: boolean;
}) {
  return (
    <>
      <PageHeader title="Homepage" description="The hero copy and the promise the storefront makes." />
      <SettingsForm
        group="homepage"
        initial={settings.homepage as unknown as Record<string, unknown>}
        canWrite={canWrite}
        sections={[
          {
            title: 'Hero',
            fields: [
              { path: 'heroEyebrow', label: 'Eyebrow', type: 'text' },
              { path: 'heroHeadline', label: 'Headline', type: 'textarea', hint: 'Line breaks are respected.' },
              { path: 'heroSubhead', label: 'Supporting line', type: 'textarea' },
              { path: 'heroPrimaryCta.label', label: 'Primary button', type: 'text' },
              { path: 'heroPrimaryCta.href', label: 'Primary link', type: 'text' },
              { path: 'heroSecondaryCta.label', label: 'Secondary button', type: 'text' },
              { path: 'heroSecondaryCta.href', label: 'Secondary link', type: 'text' },
            ],
          },
          {
            title: 'Featured section',
            fields: [
              { path: 'featuredHeading', label: 'Heading', type: 'text' },
              { path: 'featuredSubheading', label: 'Subheading', type: 'text' },
            ],
          },
        ]}
        footnote="Which products appear in the featured rail is set per product, under Publish in the product editor."
      />

      <div className="mt-8">
        <PageHeader
          title="Trust statements"
          description="The four promises shown under the hero. Only claim what you can stand behind — these are your words, not defaults you cannot change."
        />
        <SettingsForm
          group="trust"
          initial={settings.trust as unknown as Record<string, unknown>}
          canWrite={canWrite}
          sections={[
            {
              title: 'Statements',
              fields: settings.trust.statements.flatMap((_, index) => [
                { path: `statements.${index}.title`, label: `Statement ${index + 1} — title`, type: 'text' as const },
                { path: `statements.${index}.body`, label: `Statement ${index + 1} — text`, type: 'text' as const },
              ]),
            },
            {
              title: 'Payment badges',
              fields: [
                {
                  path: 'showPaymentBadges',
                  label: 'Show accepted payment methods in the footer',
                  type: 'boolean' as const,
                },
              ],
            },
          ]}
        />
      </div>
    </>
  );
}
