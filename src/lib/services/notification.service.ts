import { prisma } from '../db';
import { logger } from '../logger';
import { getSettings } from '../settings';

/**
 * Notifications.
 *
 * Messages are rendered from admin-editable templates and queued in the
 * database, then handed to a driver. The default driver logs — no mail is
 * sent from a fresh install, which is what you want in development. Point
 * MAIL_DRIVER at smtp (and SMS_DRIVER at http) in production; the queue and
 * the templates do not change.
 */

export interface QueueNotificationInput {
  templateKey: string;
  to: string;
  channel?: 'EMAIL' | 'SMS';
  userId?: string | null;
  variables?: Record<string, string>;
}

export const DEFAULT_TEMPLATES: {
  key: string;
  channel: 'EMAIL' | 'SMS';
  subject?: string;
  body: string;
}[] = [
  {
    key: 'account.created',
    channel: 'EMAIL',
    subject: 'Welcome to {{storeName}}',
    body: 'Hello {{firstName}},\n\nYour {{storeName}} account is ready. You can track orders and save addresses from your account area.\n\n{{storeName}}',
  },
  {
    key: 'order.confirmed',
    channel: 'EMAIL',
    subject: 'Order {{orderNumber}} confirmed',
    body: 'Thank you — we have received your order {{orderNumber}} ({{itemCount}} item(s), {{total}} {{currency}}).\n\nWe will email you again the moment it ships.\n\n{{storeName}}',
  },
  {
    key: 'payment.succeeded',
    channel: 'EMAIL',
    subject: 'Payment received for {{orderNumber}}',
    body: 'We have received your payment of {{total}} {{currency}} for order {{orderNumber}}.\n\n{{storeName}}',
  },
  {
    key: 'payment.failed',
    channel: 'EMAIL',
    subject: "Payment wasn't completed for {{orderNumber}}",
    body: 'Your payment for order {{orderNumber}} was not completed, so nothing has been charged. Your order is saved and you can retry payment from your account.\n\n{{storeName}}',
  },
  {
    key: 'order.status_changed',
    channel: 'EMAIL',
    subject: 'Order {{orderNumber}} is now {{status}}',
    body: 'Your order {{orderNumber}} is now {{status}}.\n\n{{storeName}}',
  },
  {
    key: 'order.shipped',
    channel: 'EMAIL',
    subject: 'Order {{orderNumber}} is on its way',
    body: 'Your order {{orderNumber}} has shipped.\n\nTracking: {{trackingNumber}}\n\n{{storeName}}',
  },
  {
    key: 'password.reset',
    channel: 'EMAIL',
    subject: 'Reset your {{storeName}} password',
    body: 'Use this link within 60 minutes to choose a new password:\n\n{{resetUrl}}\n\nIf you did not ask for this, you can ignore this email.',
  },
  {
    key: 'order.admin_alert',
    channel: 'EMAIL',
    subject: 'New order {{orderNumber}}',
    body: 'A new order was placed: {{orderNumber}} for {{total}} {{currency}}.',
  },
];

function render(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '');
}

export async function queueNotification(input: QueueNotificationInput): Promise<void> {
  try {
    const settings = await getSettings();
    const channel = input.channel ?? 'EMAIL';

    if (channel === 'EMAIL') {
      const enabled = settings.notifications;
      if (input.templateKey === 'order.confirmed' && !enabled.orderConfirmationEmail) return;
      if (input.templateKey === 'payment.succeeded' && !enabled.paymentReceiptEmail) return;
      if (input.templateKey === 'order.status_changed' && !enabled.statusChangeEmail) return;
    }

    const stored = await prisma.notificationTemplate.findUnique({ where: { key: input.templateKey } });
    const fallback = DEFAULT_TEMPLATES.find((t) => t.key === input.templateKey);
    const template = stored?.active === false ? null : (stored ?? fallback);
    if (!template) {
      logger.warn('notification.no_template', { key: input.templateKey });
      return;
    }

    const variables = {
      storeName: settings.store.name,
      storeEmail: settings.store.email,
      ...input.variables,
    };

    const subject = template.subject ? render(template.subject, variables) : null;
    const body = render(template.body, variables);

    const record = await prisma.notification.create({
      data: {
        userId: input.userId ?? null,
        toAddress: input.to,
        channel,
        templateKey: input.templateKey,
        subject,
        body,
        status: 'QUEUED',
      },
    });

    await dispatch(record.id, channel, input.to, subject, body);
  } catch (error) {
    logger.error('notification.queue_failed', { key: input.templateKey, error: String(error) });
  }
}

async function dispatch(
  id: string,
  channel: 'EMAIL' | 'SMS',
  to: string,
  subject: string | null,
  body: string,
): Promise<void> {
  const driver = channel === 'EMAIL' ? (process.env.MAIL_DRIVER ?? 'log') : (process.env.SMS_DRIVER ?? 'log');

  if (driver === 'log') {
    logger.info('notification.sent(log)', { channel, to, subject, preview: body.slice(0, 120) });
    await prisma.notification.update({ where: { id }, data: { status: 'SENT', sentAt: new Date() } });
    return;
  }

  // Real drivers are intentionally left as a single integration point rather
  // than a half-written SMTP client. Wire your provider here; the queue,
  // templates, retry state and admin view already exist.
  logger.warn('notification.driver_not_implemented', { driver, channel });
  await prisma.notification.update({
    where: { id },
    data: { status: 'FAILED', error: `Driver "${driver}" is not wired up. See notification.service.ts.` },
  });
}
