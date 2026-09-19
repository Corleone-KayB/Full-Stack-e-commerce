import { z } from 'zod';
import { clientIp, created, noContent, ok, parseBody, parseQuery, route } from '@/lib/api';
import { assertCsrf, requirePermission } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { toMinor } from '@/lib/money';
import { idSchema, priceScheduleSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Scheduled and promotional pricing.
 *
 * A schedule never overwrites a variant's list price — it layers on top for a
 * window, which is what makes a promotion previewable and reversible.
 */

export const GET = route(async (request) => {
  await requirePermission('product:read');
  const { variantId } = parseQuery(request, z.object({ variantId: idSchema.optional() }));

  return ok(
    await prisma.priceSchedule.findMany({
      where: variantId ? { variantId } : {},
      orderBy: [{ startsAt: 'desc' }],
      take: 200,
      include: {
        variant: { select: { sku: true, name: true, price: true, product: { select: { name: true } } } },
      },
    }),
  );
});

export const POST = route(async (request) => {
  await assertCsrf(request);
  const user = await requirePermission('price:write');
  const body = await parseBody(request, priceScheduleSchema);

  const schedule = await prisma.priceSchedule.create({
    data: {
      variantId: body.variantId,
      label: body.label ?? null,
      price: toMinor(body.price),
      compareAtPrice: body.compareAtPrice ? toMinor(body.compareAtPrice) : null,
      startsAt: body.startsAt,
      endsAt: body.endsAt ?? null,
      priority: body.priority,
      active: body.active,
    },
    include: { variant: { select: { sku: true } } },
  });

  await recordAudit({
    actor: user,
    action: 'price.changed',
    summary: `Scheduled ${body.label ?? 'a promotion'} on ${schedule.variant.sku} from ${body.startsAt.toISOString().slice(0, 10)}.`,
    targetType: 'variant',
    targetId: body.variantId,
    meta: { price: schedule.price, startsAt: body.startsAt, endsAt: body.endsAt },
    ip: clientIp(request),
  });

  return created(schedule);
});

export const DELETE = route(async (request) => {
  await assertCsrf(request);
  const user = await requirePermission('price:write');
  const { id } = await parseBody(request, z.object({ id: idSchema }));

  await prisma.priceSchedule.delete({ where: { id } });
  await recordAudit({
    actor: user,
    action: 'price.changed',
    summary: `Removed a scheduled price (${id}).`,
    targetType: 'priceSchedule',
    targetId: id,
  });

  return noContent();
});
