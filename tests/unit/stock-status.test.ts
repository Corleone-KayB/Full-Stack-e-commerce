import { describe, expect, it } from 'vitest';
import { describeStock } from '@/lib/services/inventory.service';

/**
 * `available = onHand − reserved` is the number a shopper is allowed to buy.
 * Getting the derived status wrong is how a store sells something it does not
 * have, so the boundaries are pinned individually.
 */

function stock(over: Partial<Parameters<typeof describeStock>[0]> = {}) {
  return describeStock({
    variantId: 'var_1',
    onHand: 10,
    reserved: 0,
    lowStockThreshold: 3,
    backorderable: false,
    ...over,
  });
}

describe('describeStock', () => {
  it('subtracts reservations from what is on hand', () => {
    expect(stock({ onHand: 10, reserved: 4 }).available).toBe(6);
  });

  it('never reports negative availability', () => {
    const view = stock({ onHand: 2, reserved: 5 });
    expect(view.available).toBe(0);
    expect(view.status).toBe('OUT_OF_STOCK');
  });

  it('is IN_STOCK comfortably above the threshold', () => {
    expect(stock({ onHand: 10, lowStockThreshold: 3 }).status).toBe('IN_STOCK');
  });

  it('is LOW_STOCK at the threshold, not one below it', () => {
    expect(stock({ onHand: 4, lowStockThreshold: 3 }).status).toBe('IN_STOCK');
    expect(stock({ onHand: 3, lowStockThreshold: 3 }).status).toBe('LOW_STOCK');
    expect(stock({ onHand: 1, lowStockThreshold: 3 }).status).toBe('LOW_STOCK');
  });

  it('counts reservations towards the low-stock warning', () => {
    // Nine on the shelf, but eight are spoken for.
    expect(stock({ onHand: 9, reserved: 8, lowStockThreshold: 3 }).status).toBe('LOW_STOCK');
  });

  it('is OUT_OF_STOCK at zero available', () => {
    expect(stock({ onHand: 0 }).status).toBe('OUT_OF_STOCK');
    expect(stock({ onHand: 5, reserved: 5 }).status).toBe('OUT_OF_STOCK');
  });

  it('offers BACKORDER instead of OUT_OF_STOCK when the SKU allows it', () => {
    expect(stock({ onHand: 0, backorderable: true }).status).toBe('BACKORDER');
    // A backorderable SKU that still has stock behaves normally.
    expect(stock({ onHand: 10, backorderable: true }).status).toBe('IN_STOCK');
  });

  it('passes the raw counters through untouched for the admin view', () => {
    const view = stock({ onHand: 7, reserved: 2, lowStockThreshold: 5 });
    expect(view).toMatchObject({ variantId: 'var_1', onHand: 7, reserved: 2, lowStockThreshold: 5 });
  });
});
