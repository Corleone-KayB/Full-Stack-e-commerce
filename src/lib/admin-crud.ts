import type { ZodTypeAny } from 'zod';
import { clientIp, created, noContent, ok, parseBody, route, userAgent } from './api';
import { assertCsrf, requirePermission } from './auth';
import { recordAudit, type AuditAction } from './audit';
import { AppError } from './errors';
import type { Permission } from './rbac';

/**
 * Admin CRUD factory.
 *
 * The taxonomy resources — categories, brands, series, attributes, coupons,
 * delivery zones — are all the same shape: list, create, patch, delete, each
 * behind one permission and each audited. Writing that six times invites the
 * sixth one to forget the audit call, so it is written once here.
 *
 * Resource definitions live in lib/admin-resources.ts, not in route files:
 * a Next.js route module may only export HTTP handlers and route config.
 */

export interface CrudResource {
  /** Used in audit summaries: "category", "brand". */
  entity: string;
  permission: { read: Permission; write: Permission };
  schema: ZodTypeAny;
  auditAction: AuditAction;
  list: (query: URLSearchParams) => Promise<unknown>;
  create: (input: unknown) => Promise<{ id: string }>;
  update: (id: string, input: unknown) => Promise<{ id: string }>;
  remove: (id: string) => Promise<{ blocked?: string } | void>;
  describe: (row: unknown) => string;
}

export function crudCollection(resource: CrudResource) {
  const GET = route(async (request) => {
    await requirePermission(resource.permission.read);
    const url = new URL(request.url);
    return ok(await resource.list(url.searchParams));
  });

  const POST = route(async (request) => {
    await assertCsrf(request);
    const user = await requirePermission(resource.permission.write);
    const input = await parseBody(request, resource.schema);
    const row = await resource.create(input);

    await recordAudit({
      actor: user,
      action: resource.auditAction,
      summary: `Created ${resource.entity} “${resource.describe(row)}”.`,
      targetType: resource.entity,
      targetId: row.id,
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    return created(row);
  });

  return { GET, POST };
}

export function crudItem(resource: CrudResource) {
  type Ctx = { params: Promise<{ id: string }> };

  const PATCH = route<Ctx>(async (request, { params }) => {
    await assertCsrf(request);
    const user = await requirePermission(resource.permission.write);
    const { id } = await params;

    // Partial updates: the admin forms send only what changed.
    const schema = 'partial' in resource.schema && typeof resource.schema.partial === 'function'
      ? (resource.schema as unknown as { partial: () => ZodTypeAny }).partial()
      : resource.schema;

    const input = await parseBody(request, schema);
    const row = await resource.update(id, input);

    await recordAudit({
      actor: user,
      action: resource.auditAction,
      summary: `Updated ${resource.entity} “${resource.describe(row)}”.`,
      targetType: resource.entity,
      targetId: id,
      meta: { fields: Object.keys(input as Record<string, unknown>) },
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    return ok(row);
  });

  const DELETE = route<Ctx>(async (request, { params }) => {
    await assertCsrf(request);
    const user = await requirePermission(resource.permission.write);
    const { id } = await params;

    const result = await resource.remove(id);
    if (result && 'blocked' in result && result.blocked) {
      // Refusing with a reason beats a foreign-key error the merchant cannot read.
      throw new AppError('CONFLICT', result.blocked);
    }

    await recordAudit({
      actor: user,
      action: resource.auditAction,
      summary: `Deleted ${resource.entity} ${id}.`,
      targetType: resource.entity,
      targetId: id,
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    return noContent();
  });

  return { PATCH, DELETE };
}
