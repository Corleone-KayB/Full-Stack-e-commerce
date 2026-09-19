import type { Prisma } from '@/generated/prisma/client';
import { prisma, type Tx } from '../db';
import { AppError, outOfStock } from '../errors';
import { logger } from '../logger';
import type { InventoryMovementType } from '@/types/enums';

/**
 * Inventory.
 *
 * Two counters per SKU:
 *   onHand   — physically in the warehouse
 *   reserved — spoken for by orders that are placed but not yet paid/shipped
 *   available = onHand − reserved   ← what a shopper may buy
 *
 * Overselling is prevented by doing the check and the decrement inside one
 * transaction with a conditional update: the write only lands if `reserved` is
 * still what we read. Two concurrent checkouts for the last unit therefore
 * produce one success and one OUT_OF_STOCK, never two sales.
 *
 * Every change writes an InventoryMovement, so stock is always explainable.
 */

export interface StockView {
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  backorderable: boolean;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'BACKORDER';
}

export function describeStock(inv: {
  onHand: number;
  reserved: number;
  lowStockThreshold: number;
  backorderable: boolean;
  variantId: string;
}): StockView {
  const available = Math.max(0, inv.onHand - inv.reserved);
  let status: StockView['status'] = 'IN_STOCK';
  if (available <= 0) status = inv.backorderable ? 'BACKORDER' : 'OUT_OF_STOCK';
  else if (available <= inv.lowStockThreshold) status = 'LOW_STOCK';
  return {
    variantId: inv.variantId,
    onHand: inv.onHand,
    reserved: inv.reserved,
    available,
    lowStockThreshold: inv.lowStockThreshold,
    backorderable: inv.backorderable,
    status,
  };
}

export async function getStock(variantId: string): Promise<StockView | null> {
  const inv = await prisma.inventory.findUnique({ where: { variantId } });
  return inv ? describeStock(inv) : null;
}

export async function getStockMap(variantIds: string[]): Promise<Map<string, StockView>> {
  if (!variantIds.length) return new Map();
  const rows = await prisma.inventory.findMany({ where: { variantId: { in: variantIds } } });
  return new Map(rows.map((r) => [r.variantId, describeStock(r)]));
}

interface MovementInput {
  variantId: string;
  type: InventoryMovementType;
  quantity: number;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  userId?: string | null;
}

async function writeMovement(
  tx: Tx,
  input: MovementInput,
  resulting: { onHand: number; reserved: number },
) {
  await tx.inventoryMovement.create({
    data: {
      variantId: input.variantId,
      type: input.type,
      quantity: input.quantity,
      reason: input.reason ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      resultingOnHand: resulting.onHand,
      resultingReserved: resulting.reserved,
      userId: input.userId ?? null,
    },
  });
}

/**
 * Reserves stock for an order inside the caller's transaction.
 * Throws OUT_OF_STOCK — with the SKU and what is actually left — if it cannot.
 */
export async function reserveStock(
  tx: Tx,
  lines: { variantId: string; quantity: number; label: string }[],
  reference: { type: string; id: string },
): Promise<void> {
  for (const line of lines) {
    const inv = await tx.inventory.findUnique({ where: { variantId: line.variantId } });
    if (!inv) {
      throw outOfStock(`${line.label} is no longer available.`, { variantId: line.variantId, available: 0 });
    }
    const available = inv.onHand - inv.reserved;
    if (!inv.backorderable && available < line.quantity) {
      throw outOfStock(
        available <= 0
          ? `${line.label} has just sold out.`
          : `Only ${available} left of ${line.label}.`,
        { variantId: line.variantId, available: Math.max(0, available), requested: line.quantity },
      );
    }

    // Conditional write: `reserved` must still be the value we validated
    // against, otherwise a concurrent checkout beat us to the last unit.
    const result = await tx.inventory.updateMany({
      where: { variantId: line.variantId, reserved: inv.reserved, onHand: inv.onHand },
      data: { reserved: inv.reserved + line.quantity },
    });
    if (result.count !== 1) {
      throw outOfStock(`${line.label} was taken while you were checking out. Please try again.`, {
        variantId: line.variantId,
        available: Math.max(0, available),
      });
    }

    await writeMovement(
      tx,
      {
        variantId: line.variantId,
        type: 'RESERVE',
        quantity: line.quantity,
        referenceType: reference.type,
        referenceId: reference.id,
        reason: 'Reserved for order',
      },
      { onHand: inv.onHand, reserved: inv.reserved + line.quantity },
    );
  }
}

/** Releases a reservation — cancelled order, expired payment, abandoned cart. */
export async function releaseStock(
  tx: Tx,
  lines: { variantId: string; quantity: number }[],
  reference: { type: string; id: string },
  reason = 'Reservation released',
): Promise<void> {
  for (const line of lines) {
    const inv = await tx.inventory.findUnique({ where: { variantId: line.variantId } });
    if (!inv) continue;
    const reserved = Math.max(0, inv.reserved - line.quantity);
    await tx.inventory.update({ where: { variantId: line.variantId }, data: { reserved } });
    await writeMovement(
      tx,
      {
        variantId: line.variantId,
        type: 'RELEASE',
        quantity: line.quantity,
        referenceType: reference.type,
        referenceId: reference.id,
        reason,
      },
      { onHand: inv.onHand, reserved },
    );
  }
}

/**
 * Converts a reservation into a sale: stock leaves the building.
 * Called once payment is verified, never on the browser's say-so.
 */
export async function fulfillStock(
  tx: Tx,
  lines: { variantId: string; quantity: number }[],
  reference: { type: string; id: string },
): Promise<void> {
  for (const line of lines) {
    const inv = await tx.inventory.findUnique({ where: { variantId: line.variantId } });
    if (!inv) continue;
    const onHand = Math.max(0, inv.onHand - line.quantity);
    const reserved = Math.max(0, inv.reserved - line.quantity);
    await tx.inventory.update({ where: { variantId: line.variantId }, data: { onHand, reserved } });
    await writeMovement(
      tx,
      {
        variantId: line.variantId,
        type: 'FULFILL',
        quantity: -line.quantity,
        referenceType: reference.type,
        referenceId: reference.id,
        reason: 'Sold',
      },
      { onHand, reserved },
    );
  }
}

/** Returns stock to shelf after a refund or a customer return. */
export async function returnStock(
  tx: Tx,
  lines: { variantId: string; quantity: number }[],
  reference: { type: string; id: string },
): Promise<void> {
  for (const line of lines) {
    const inv = await tx.inventory.findUnique({ where: { variantId: line.variantId } });
    if (!inv) continue;
    const onHand = inv.onHand + line.quantity;
    await tx.inventory.update({ where: { variantId: line.variantId }, data: { onHand } });
    await writeMovement(
      tx,
      {
        variantId: line.variantId,
        type: 'RETURN',
        quantity: line.quantity,
        referenceType: reference.type,
        referenceId: reference.id,
        reason: 'Returned to stock',
      },
      { onHand, reserved: inv.reserved },
    );
  }
}

/** Admin adjustment: increase, decrease or set an absolute figure. */
export async function adjustStock(input: {
  variantId: string;
  mode: 'increase' | 'decrease' | 'set';
  quantity: number;
  reason?: string;
  userId?: string;
  lowStockThreshold?: number;
  backorderable?: boolean;
}): Promise<StockView> {
  if (input.quantity < 0) throw new AppError('VALIDATION_ERROR', 'Quantity cannot be negative.');

  return prisma.$transaction(async (tx) => {
    const inv = await tx.inventory.findUnique({ where: { variantId: input.variantId } });
    if (!inv) throw new AppError('NOT_FOUND', 'No inventory record for this SKU.');

    let onHand = inv.onHand;
    if (input.mode === 'increase') onHand += input.quantity;
    else if (input.mode === 'decrease') onHand = Math.max(0, onHand - input.quantity);
    else onHand = input.quantity;

    const data: Prisma.InventoryUpdateInput = { onHand };
    if (typeof input.lowStockThreshold === 'number') data.lowStockThreshold = input.lowStockThreshold;
    if (typeof input.backorderable === 'boolean') data.backorderable = input.backorderable;

    const updated = await tx.inventory.update({ where: { variantId: input.variantId }, data });
    await writeMovement(
      tx,
      {
        variantId: input.variantId,
        type: input.mode === 'set' ? 'SET' : input.mode === 'increase' ? 'RECEIVE' : 'ADJUST',
        quantity: onHand - inv.onHand,
        reason: input.reason ?? `Manual ${input.mode}`,
        referenceType: 'manual',
        userId: input.userId,
      },
      { onHand, reserved: updated.reserved },
    );

    return describeStock(updated);
  });
}

/**
 * Releases reservations held by orders whose payment window has passed.
 * Run from a cron/queue; safe to call repeatedly.
 */
export async function releaseExpiredReservations(now: Date = new Date()): Promise<number> {
  const stale = await prisma.order.findMany({
    where: {
      status: 'PENDING',
      paymentStatus: { in: ['PENDING', 'PROCESSING', 'FAILED', 'EXPIRED', 'CANCELLED'] },
      placedAt: { lt: new Date(now.getTime() - Number(process.env.PAYMENT_EXPIRY_MINUTES ?? 15) * 60_000) },
    },
    include: { items: true },
    take: 100,
  });

  let released = 0;
  for (const order of stale) {
    await prisma.$transaction(async (tx) => {
      await releaseStock(
        tx,
        order.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity })),
        { type: 'order', id: order.id },
        'Payment window expired',
      );
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          paymentStatus: order.paymentStatus === 'PENDING' ? 'EXPIRED' : order.paymentStatus,
          cancelledAt: now,
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'STATUS_CHANGED',
          message: 'Cancelled automatically — payment was not completed in time. Stock returned to sale.',
          visibleToCustomer: true,
        },
      });
    });
    released += 1;
  }
  if (released) logger.info('inventory.reservations_released', { orders: released });
  return released;
}

/** Dashboard queries. */
export async function lowStockVariants(limit = 20) {
  const rows = await prisma.inventory.findMany({
    where: { onHand: { gt: 0 } },
    include: { variant: { include: { product: { select: { name: true, slug: true } } } } },
    orderBy: { onHand: 'asc' },
    take: 200,
  });
  return rows
    .map((r) => ({ ...describeStock(r), variant: r.variant }))
    .filter((r) => r.status === 'LOW_STOCK')
    .slice(0, limit);
}

export async function outOfStockVariants(limit = 20) {
  const rows = await prisma.inventory.findMany({
    where: { onHand: { lte: 0 } },
    include: { variant: { include: { product: { select: { name: true, slug: true } } } } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => ({ ...describeStock(r), variant: r.variant }));
}
