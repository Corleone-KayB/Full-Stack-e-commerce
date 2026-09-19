import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { addToCart, findOrCreateCart } from '@/lib/services/cart.service';

/**
 * Helpers for the integration suites.
 *
 * Every test works against a throwaway copy of the seeded database (see
 * tests/setup.ts), so fixtures pick real products out of the seed rather than
 * inventing synthetic ones — which means the tests exercise the same data
 * shapes the storefront renders.
 */

export const hasTestDb = process.env.AURUM_TEST_DB_READY === '1';

/** A sellable variant with plenty of stock, and its inventory row. */
export async function pickVariant(minAvailable = 5) {
  const rows = await prisma.inventory.findMany({
    where: { variant: { active: true, product: { active: true } } },
    include: { variant: { include: { product: true } } },
    orderBy: { onHand: 'desc' },
    take: 40,
  });
  const found = rows.find((row) => row.onHand - row.reserved >= minAvailable);
  if (!found) throw new Error('The seeded catalogue has no variant with enough stock for this test.');
  return found;
}

/** Sets a variant's stock to an exact figure so a test can reason about it. */
export async function setStock(variantId: string, onHand: number, reserved = 0) {
  return prisma.inventory.update({ where: { variantId }, data: { onHand, reserved } });
}

/**
 * Builds a cart through the real service, so lines carry the same price
 * snapshot and validation a shopper's cart would.
 */
export async function makeCart(lines: { variantId: string; quantity: number }[]) {
  const token = `test_${randomUUID()}`;
  const cart = await findOrCreateCart(token);
  for (const line of lines) await addToCart(cart.id, line.variantId, line.quantity);
  return { cart, token };
}

export function guestCheckout(token: string, over: Record<string, unknown> = {}) {
  return {
    cartToken: token,
    email: `buyer-${randomUUID().slice(0, 8)}@example.com`,
    deliveryMethod: 'DELIVERY' as const,
    shippingAddress: {
      firstName: 'Test',
      lastName: 'Buyer',
      phone: '0781234560',
      line1: '1 Test Street',
      city: 'Dubai',
      country: 'AE',
    },
    ...over,
  };
}

/** Frees a variant from whatever a previous test did to it. */
export async function resetStock(variantId: string, onHand: number) {
  await prisma.inventory.update({ where: { variantId }, data: { onHand, reserved: 0 } });
}
