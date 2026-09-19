import { clientIp, ok, parseBody, route, userAgent } from '@/lib/api';
import { assertCsrf, requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { getSettings, updateSettingGroup, type StoreSettings } from '@/lib/settings';
import { settingsPatchSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Store settings.
 *
 * Payment configuration is a separate permission from the rest, because the
 * people who write marketing copy are rarely the people who should be able to
 * point the store at a different payment processor.
 */

export const GET = route(async () => {
  await requirePermission('settings:read');
  return ok(await getSettings(true));
});

export const PATCH = route(async (request) => {
  await assertCsrf(request);
  const body = await parseBody(request, settingsPatchSchema);

  const user =
    body.group === 'payments'
      ? await requirePermission('payment:configure')
      : await requirePermission('settings:write');

  const next = await updateSettingGroup(
    body.group as keyof StoreSettings,
    body.value as Partial<StoreSettings[keyof StoreSettings]>,
  );

  await recordAudit({
    actor: user,
    action: body.group === 'payments' ? 'payment.config_changed' : 'settings.updated',
    summary: `Updated ${body.group} settings.`,
    targetType: 'settings',
    targetId: body.group,
    // The redactor strips anything credential-shaped before this is stored.
    meta: { fields: Object.keys(body.value) },
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return ok(next);
});
