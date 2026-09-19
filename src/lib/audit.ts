import { prisma } from './db';
import { encodeRedactedJson } from './json';
import { logger } from './logger';
import type { SessionUser } from './auth';

/**
 * Audit log.
 *
 * Records who changed what. Writes are best-effort and never break the
 * operation being audited, but failures are logged loudly.
 */

export type AuditAction =
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'product.duplicated'
  | 'product.published'
  | 'price.changed'
  | 'variant.created'
  | 'variant.updated'
  | 'variant.deleted'
  | 'taxonomy.changed'
  | 'inventory.adjusted'
  | 'order.status_changed'
  | 'order.note_added'
  | 'order.cancelled'
  | 'payment.refunded'
  | 'payment.config_changed'
  | 'settings.updated'
  | 'user.created'
  | 'user.updated'
  | 'user.role_changed'
  | 'coupon.changed'
  | 'content.updated'
  | 'import.committed'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout';

export interface AuditInput {
  actor?: Pick<SessionUser, 'id' | 'email'> | null;
  action: AuditAction;
  summary: string;
  targetType?: string;
  targetId?: string;
  meta?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        action: input.action,
        summary: input.summary,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        meta: input.meta ? encodeRedactedJson(input.meta) : null,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 255) ?? null,
      },
    });
  } catch (error) {
    logger.error('audit.write_failed', { action: input.action, error: String(error) });
  }
}

/** Produces a compact before/after diff for the audit meta column. */
export function diff<T extends Record<string, unknown>>(
  before: T | null,
  after: T,
  fields: (keyof T)[],
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of fields) {
    const from = before ? before[field] : undefined;
    const to = after[field];
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      out[String(field)] = { from: from ?? null, to: to ?? null };
    }
  }
  return out;
}
