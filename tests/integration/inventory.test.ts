import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { adjustStock, fulfillStock, getStock, releaseStock, reserveStock, returnStock } from '@/lib/services/inventory.service';
import { hasTestDb, pickVariant } from '../helpers/fixtures';

/**
 * Stock is the one number a shop cannot get wrong twice. These tests drive the
 * real service against a real database: reservations, the conditional write
 * that stops two shoppers buying the same last unit, and the movement ledger
 * that has to explain every change afterwards.
 */

const suite = hasTestDb ? describe : describe.skip;

suite('inventory service', () => {
  let variantId: string;

  beforeEach(async () => {
    const inv = await pickVariant(5);
    variantId = inv.variantId;
    await prisma.inventory.update({
      where: { variantId },
      data: { onHand: 10, reserved: 0, lowStockThreshold: 3, backorderable: false },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reserves stock and reduces what is available to buy', async () => {
    await prisma.$transaction((tx) =>
      reserveStock(tx, [{ variantId, quantity: 3, label: 'Test SKU' }], { type: 'test', id: 'r1' }),
    );

    const stock = await getStock(variantId);
    expect(stock).toMatchObject({ onHand: 10, reserved: 3, available: 7, status: 'IN_STOCK' });
  });

  it('refuses to reserve more than is available, and says how many are left', async () => {
    await prisma.inventory.update({ where: { variantId }, data: { onHand: 2, reserved: 0 } });

    await expect(
      prisma.$transaction((tx) =>
        reserveStock(tx, [{ variantId, quantity: 5, label: 'iPhone 15 · 128 GB' }], { type: 'test', id: 'r2' }),
      ),
    ).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });

    const error = await prisma
      .$transaction((tx) => reserveStock(tx, [{ variantId, quantity: 5, label: 'iPhone 15 · 128 GB' }], { type: 'test', id: 'r3' }))
      .catch((e: AppError) => e);
    expect((error as AppError).message).toContain('Only 2 left');

    // Nothing was written.
    expect((await getStock(variantId))!.reserved).toBe(0);
  });

  it('rolls the whole reservation back when a later line fails', async () => {
    const other = await prisma.inventory.findFirst({
      where: { variantId: { not: variantId }, variant: { active: true } },
    });
    await prisma.inventory.update({ where: { variantId: other!.variantId }, data: { onHand: 0, reserved: 0 } });

    await expect(
      prisma.$transaction((tx) =>
        reserveStock(
          tx,
          [
            { variantId, quantity: 2, label: 'First line' },
            { variantId: other!.variantId, quantity: 1, label: 'Second line' },
          ],
          { type: 'test', id: 'r4' },
        ),
      ),
    ).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });

    // The first line must not be left reserved by a half-applied order.
    expect((await getStock(variantId))!.reserved).toBe(0);
  });

  it('allows a backorderable SKU to be reserved past zero', async () => {
    await prisma.inventory.update({ where: { variantId }, data: { onHand: 0, reserved: 0, backorderable: true } });
    await prisma.$transaction((tx) =>
      reserveStock(tx, [{ variantId, quantity: 2, label: 'Backorder SKU' }], { type: 'test', id: 'r5' }),
    );
    const stock = await getStock(variantId);
    expect(stock).toMatchObject({ reserved: 2, available: 0, status: 'BACKORDER' });
  });

  it('gives the last unit to exactly one of two concurrent checkouts', async () => {
    await prisma.inventory.update({ where: { variantId }, data: { onHand: 1, reserved: 0 } });

    const attempt = () =>
      prisma.$transaction((tx) =>
        reserveStock(tx, [{ variantId, quantity: 1, label: 'Last unit' }], { type: 'test', id: 'race' }),
      );

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'OUT_OF_STOCK' });

    // And the counter is never oversubscribed.
    const stock = await getStock(variantId);
    expect(stock!.reserved).toBe(1);
    expect(stock!.available).toBe(0);
  });

  it('releases a reservation and puts the units back on sale', async () => {
    await prisma.$transaction((tx) =>
      reserveStock(tx, [{ variantId, quantity: 4, label: 'SKU' }], { type: 'test', id: 'rel' }),
    );
    await prisma.$transaction((tx) =>
      releaseStock(tx, [{ variantId, quantity: 4 }], { type: 'test', id: 'rel' }, 'Cancelled'),
    );
    expect(await getStock(variantId)).toMatchObject({ onHand: 10, reserved: 0, available: 10 });
  });

  it('never drives reserved below zero on an over-release', async () => {
    await prisma.$transaction((tx) => releaseStock(tx, [{ variantId, quantity: 99 }], { type: 'test', id: 'rel2' }));
    expect((await getStock(variantId))!.reserved).toBe(0);
  });

  it('fulfilment takes the units off the shelf as well as out of reserve', async () => {
    await prisma.$transaction((tx) =>
      reserveStock(tx, [{ variantId, quantity: 3, label: 'SKU' }], { type: 'test', id: 'f1' }),
    );
    await prisma.$transaction((tx) => fulfillStock(tx, [{ variantId, quantity: 3 }], { type: 'test', id: 'f1' }));

    expect(await getStock(variantId)).toMatchObject({ onHand: 7, reserved: 0, available: 7 });
  });

  it('a return puts stock back without touching reservations', async () => {
    await prisma.$transaction((tx) => returnStock(tx, [{ variantId, quantity: 2 }], { type: 'test', id: 'ret' }));
    expect(await getStock(variantId)).toMatchObject({ onHand: 12, reserved: 0 });
  });

  it('writes a movement for every change, with the resulting balance', async () => {
    const before = await prisma.inventoryMovement.count({ where: { variantId } });

    await prisma.$transaction((tx) =>
      reserveStock(tx, [{ variantId, quantity: 2, label: 'SKU' }], { type: 'order', id: 'ord_x' }),
    );
    await prisma.$transaction((tx) => fulfillStock(tx, [{ variantId, quantity: 2 }], { type: 'order', id: 'ord_x' }));

    const movements = await prisma.inventoryMovement.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });
    expect(await prisma.inventoryMovement.count({ where: { variantId } })).toBe(before + 2);

    const fulfil = movements.find((m) => m.type === 'FULFILL')!;
    const reserve = movements.find((m) => m.type === 'RESERVE')!;
    expect(reserve).toMatchObject({ quantity: 2, resultingReserved: 2, resultingOnHand: 10, referenceId: 'ord_x' });
    expect(fulfil).toMatchObject({ quantity: -2, resultingReserved: 0, resultingOnHand: 8 });
  });

  describe('admin adjustments', () => {
    it('increases, decreases and sets an absolute figure', async () => {
      expect((await adjustStock({ variantId, mode: 'increase', quantity: 5 })).onHand).toBe(15);
      expect((await adjustStock({ variantId, mode: 'decrease', quantity: 3 })).onHand).toBe(12);
      expect((await adjustStock({ variantId, mode: 'set', quantity: 40 })).onHand).toBe(40);
    });

    it('clamps a decrease at zero rather than going negative', async () => {
      expect((await adjustStock({ variantId, mode: 'decrease', quantity: 999 })).onHand).toBe(0);
    });

    it('rejects a negative quantity outright', async () => {
      await expect(adjustStock({ variantId, mode: 'set', quantity: -1 })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });

    it('can change the low-stock threshold in the same operation', async () => {
      const view = await adjustStock({ variantId, mode: 'set', quantity: 4, lowStockThreshold: 6 });
      expect(view).toMatchObject({ onHand: 4, lowStockThreshold: 6, status: 'LOW_STOCK' });
    });

    it('refuses to adjust a SKU with no inventory record', async () => {
      await expect(adjustStock({ variantId: 'does-not-exist', mode: 'set', quantity: 1 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
});
