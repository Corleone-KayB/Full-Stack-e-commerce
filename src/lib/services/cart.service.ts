import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors';
import { applyPercent, convert } from '../money';
import { getSettings } from '../settings';
import { getBaseCurrency, getDisplayCurrency } from './currency.service';
import { describeStock } from './inventory.service';
import { effectivePrice, PRICING_INCLUDE } from './pricing.service';
import type { CouponType } from '@/types/enums';

/**
 * Cart + totals.
 *
 * `priceCart` is the single source of truth for what an order costs. The
 * checkout page renders it, the order writer calls it again at submit time,
 * and the two must agree — if the browser sends a total, it is ignored.
 */

const CART_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      variant: {
        include: {
          ...PRICING_INCLUDE,
          inventory: true,
          attributes: { include: { attribute: true, value: true } },
          product: {
            include: {
              images: { orderBy: { position: 'asc' as const }, take: 1 },
              brand: { select: { name: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;

export interface CartLineDTO {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  sku: string;
  brand: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  unitCompareAt: number | null;
  lineTotal: number;
  currency: string;
  attributes: Record<string, string>;
  available: number;
  stockStatus: string;
  /** Set when the live price differs from the snapshot taken at add-to-bag. */
  priceChanged: boolean;
  /** Set when the requested quantity is no longer obtainable. */
  quantityAdjusted: boolean;
}

export interface CartTotalsDTO {
  subtotal: number;
  discountTotal: number;
  deliveryTotal: number;
  taxTotal: number;
  grandTotal: number;
  currency: string;
  freeDeliveryRemaining: number | null;
  couponCode: string | null;
  couponLabel: string | null;
}

export interface CartDTO {
  id: string;
  token: string;
  lines: CartLineDTO[];
  totals: CartTotalsDTO;
  itemCount: number;
  /** Reasons the cart could not be checked out as-is. */
  issues: { code: string; message: string; variantId?: string }[];
  estimatedDelivery: string;
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

/**
 * Read-only lookup — used on page render so browsing never writes a row.
 *
 * Only an ACTIVE cart counts. A cart that has been checked out is CONVERTED
 * and must read as empty from that moment: otherwise the header badge still
 * shows the phone the customer has just bought, /cart offers to buy it again,
 * and the next add-to-bag lands in a cart an order already consumed.
 */
export async function findCart(token: string): Promise<CartWithItems | null> {
  const cart = await prisma.cart.findUnique({ where: { token }, include: CART_INCLUDE });
  return cart && cart.status === 'ACTIVE' ? cart : null;
}

/** The shape the UI renders before anything has been added. */
export async function emptyCart(token: string, displayCurrency?: string | null): Promise<CartDTO> {
  const [settings, display] = await Promise.all([getSettings(), getDisplayCurrency(displayCurrency)]);
  return {
    id: '',
    token,
    lines: [],
    itemCount: 0,
    issues: [],
    estimatedDelivery: settings.delivery.estimateCopy,
    totals: {
      subtotal: 0,
      discountTotal: 0,
      deliveryTotal: 0,
      taxTotal: 0,
      grandTotal: 0,
      currency: display.code,
      freeDeliveryRemaining: null,
      couponCode: null,
      couponLabel: null,
    },
  };
}

export async function findOrCreateCart(token: string, userId?: string | null): Promise<CartWithItems> {
  const existing = await prisma.cart.findUnique({ where: { token }, include: CART_INCLUDE });
  if (existing) {
    // The cart token is the guest cookie, which also carries the wishlist, so
    // it is not rotated after checkout. Instead a spent cart is emptied and
    // reopened here — the order keeps its own item snapshots, so nothing is
    // lost, and the shopper gets a clean bag rather than yesterday's purchase.
    if (existing.status !== 'ACTIVE') {
      await prisma.cartItem.deleteMany({ where: { cartId: existing.id } });
      return prisma.cart.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE', couponCode: null, userId: userId ?? existing.userId },
        include: CART_INCLUDE,
      });
    }
    if (userId && existing.userId !== userId) {
      return prisma.cart.update({ where: { id: existing.id }, data: { userId }, include: CART_INCLUDE });
    }
    return existing;
  }
  const settings = await getSettings();
  return prisma.cart.create({
    data: { token, userId: userId ?? null, currency: settings.currency.base },
    include: CART_INCLUDE,
  });
}

/**
 * Merges an anonymous cart into the signed-in customer's cart on login.
 * Quantities are summed and clamped to what is actually available.
 */
export async function mergeGuestCart(guestToken: string, userId: string): Promise<void> {
  const guest = await prisma.cart.findUnique({ where: { token: guestToken }, include: { items: true } });
  if (!guest || !guest.items.length) return;

  const target =
    (await prisma.cart.findFirst({
      where: { userId, status: 'ACTIVE', NOT: { id: guest.id } },
      orderBy: { updatedAt: 'desc' },
    })) ?? null;

  if (!target) {
    await prisma.cart.update({ where: { id: guest.id }, data: { userId } });
    return;
  }

  for (const item of guest.items) {
    const existing = await prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: target.id, variantId: item.variantId } },
    });
    const inventory = await prisma.inventory.findUnique({ where: { variantId: item.variantId } });
    const available = inventory ? Math.max(0, inventory.onHand - inventory.reserved) : 0;
    const desired = (existing?.quantity ?? 0) + item.quantity;
    const quantity = Math.max(1, Math.min(desired, Math.max(available, 1)));

    if (existing) {
      await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity } });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: target.id,
          variantId: item.variantId,
          quantity,
          unitPriceSnapshot: item.unitPriceSnapshot,
        },
      });
    }
  }

  await prisma.cart.delete({ where: { id: guest.id } });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function addToCart(cartId: string, variantId: string, quantity = 1): Promise<void> {
  if (quantity < 1 || quantity > 20) throw new AppError('VALIDATION_ERROR', 'Choose a quantity between 1 and 20.');

  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, active: true, product: { active: true } },
    include: { ...PRICING_INCLUDE, inventory: true, product: { select: { name: true } } },
  });
  if (!variant) throw new AppError('NOT_FOUND', 'That item is no longer available.');

  const stock = variant.inventory ? describeStock(variant.inventory) : null;
  const existing = await prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
  const desired = (existing?.quantity ?? 0) + quantity;

  if (stock && !stock.backorderable && desired > stock.available) {
    throw new AppError(
      'OUT_OF_STOCK',
      stock.available <= 0
        ? `${variant.product.name} has just sold out.`
        : `Only ${stock.available} left of ${variant.product.name}.`,
      { details: { available: stock.available } },
    );
  }

  const price = effectivePrice(variant).price;
  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: desired, unitPriceSnapshot: price },
    });
  } else {
    await prisma.cartItem.create({
      data: { cartId, variantId, quantity, unitPriceSnapshot: price },
    });
  }
  await prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
}

export async function updateCartLine(cartId: string, lineId: string, quantity: number): Promise<void> {
  const line = await prisma.cartItem.findFirst({ where: { id: lineId, cartId }, include: { variant: { include: { inventory: true, product: { select: { name: true } } } } } });
  if (!line) throw new AppError('NOT_FOUND', 'That item is not in your bag.');

  if (quantity <= 0) {
    await prisma.cartItem.delete({ where: { id: lineId } });
    return;
  }
  if (quantity > 20) throw new AppError('VALIDATION_ERROR', 'Maximum 20 per item.');

  const stock = line.variant.inventory ? describeStock(line.variant.inventory) : null;
  if (stock && !stock.backorderable && quantity > stock.available) {
    throw new AppError('OUT_OF_STOCK', `Only ${stock.available} left of ${line.variant.product.name}.`, {
      details: { available: stock.available },
    });
  }
  await prisma.cartItem.update({ where: { id: lineId }, data: { quantity } });
  await prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
}

export async function removeCartLine(cartId: string, lineId: string): Promise<void> {
  await prisma.cartItem.deleteMany({ where: { id: lineId, cartId } });
  await prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } }).catch(() => undefined);
}

export async function clearCart(cartId: string): Promise<void> {
  await prisma.cartItem.deleteMany({ where: { cartId } });
}

export async function applyCoupon(cartId: string, code: string | null): Promise<void> {
  if (!code) {
    await prisma.cart.update({ where: { id: cartId }, data: { couponCode: null } });
    return;
  }
  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  const now = new Date();
  const invalid =
    !coupon ||
    !coupon.active ||
    (coupon.startsAt && coupon.startsAt > now) ||
    (coupon.endsAt && coupon.endsAt < now) ||
    (coupon.maxRedemptions !== null && coupon.usedCount >= coupon.maxRedemptions);

  if (invalid) throw new AppError('COUPON_INVALID', 'That promotion code is not valid.');
  await prisma.cart.update({ where: { id: cartId }, data: { couponCode: coupon!.code } });
}

// ---------------------------------------------------------------------------
// Pricing — the authoritative calculation
// ---------------------------------------------------------------------------

export interface PriceCartOptions {
  /** Delivery zone chosen at checkout. */
  deliveryZoneId?: string | null;
  deliveryMethod?: 'DELIVERY' | 'PICKUP';
  /** Currency to present in. Does not change what is stored. */
  displayCurrency?: string | null;
}

export async function priceCart(cart: CartWithItems, options: PriceCartOptions = {}): Promise<CartDTO> {
  const [settings, base, display] = await Promise.all([
    getSettings(),
    getBaseCurrency(),
    getDisplayCurrency(options.displayCurrency),
  ]);
  const now = new Date();
  const issues: CartDTO['issues'] = [];
  const lines: CartLineDTO[] = [];

  for (const item of cart.items) {
    const variant = item.variant;
    const pricing = effectivePrice(variant, now);
    const stock = variant.inventory ? describeStock(variant.inventory) : null;
    const available = stock?.available ?? 0;

    const attributes: Record<string, string> = {};
    for (const link of variant.attributes) attributes[link.attribute.name] = link.value.label;

    const quantityAdjusted = !!stock && !stock.backorderable && item.quantity > available;
    const usableQuantity = quantityAdjusted ? Math.max(0, available) : item.quantity;
    const priceChanged = item.unitPriceSnapshot !== pricing.price;

    if (!variant.active || !variant.product.active) {
      issues.push({ code: 'UNAVAILABLE', message: `${variant.product.name} is no longer sold.`, variantId: variant.id });
    } else if (available <= 0 && !stock?.backorderable) {
      issues.push({ code: 'OUT_OF_STOCK', message: `${variant.product.name} has sold out.`, variantId: variant.id });
    } else if (quantityAdjusted) {
      issues.push({
        code: 'QUANTITY_REDUCED',
        message: `Only ${available} left of ${variant.product.name}.`,
        variantId: variant.id,
      });
    }
    if (priceChanged) {
      issues.push({
        code: 'PRICE_CHANGED',
        message: `The price of ${variant.product.name} has changed.`,
        variantId: variant.id,
      });
    }

    const unit = convert(pricing.price, base, display);
    lines.push({
      id: item.id,
      variantId: variant.id,
      productId: variant.productId,
      productName: variant.product.name,
      productSlug: variant.product.slug,
      variantName: variant.name,
      sku: variant.sku,
      brand: variant.product.brand.name,
      imageUrl: variant.imageUrl ?? variant.product.images[0]?.url ?? null,
      quantity: item.quantity,
      unitPrice: unit,
      unitCompareAt: pricing.compareAtPrice ? convert(pricing.compareAtPrice, base, display) : null,
      lineTotal: unit * usableQuantity,
      currency: display.code,
      attributes,
      available,
      stockStatus: stock?.status ?? 'OUT_OF_STOCK',
      priceChanged,
      quantityAdjusted,
    });
  }

  // Subtotal is computed in BASE currency, then presented — never the reverse,
  // so rounding cannot drift between what we charge and what we display.
  const subtotalBase = cart.items.reduce((sum, item) => {
    const pricing = effectivePrice(item.variant, now);
    const stock = item.variant.inventory ? describeStock(item.variant.inventory) : null;
    const qty = stock && !stock.backorderable ? Math.min(item.quantity, Math.max(0, stock.available)) : item.quantity;
    return sum + pricing.price * qty;
  }, 0);

  // Discount
  let discountBase = 0;
  let couponLabel: string | null = null;
  let freeDelivery = false;
  if (cart.couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: cart.couponCode } });
    const valid =
      coupon &&
      coupon.active &&
      (!coupon.startsAt || coupon.startsAt <= now) &&
      (!coupon.endsAt || coupon.endsAt >= now) &&
      (coupon.maxRedemptions === null || coupon.usedCount < coupon.maxRedemptions) &&
      (coupon.minSubtotal === null || subtotalBase >= coupon.minSubtotal);

    if (valid && coupon) {
      const type = coupon.type as CouponType;
      if (type === 'PERCENT') {
        discountBase = applyPercent(subtotalBase, Math.min(100, coupon.value));
        if (coupon.maxDiscount) discountBase = Math.min(discountBase, coupon.maxDiscount);
        couponLabel = `${coupon.value}% off`;
      } else if (type === 'FIXED') {
        discountBase = Math.min(coupon.value, subtotalBase);
        couponLabel = coupon.description ?? 'Promotion applied';
      } else {
        freeDelivery = true;
        couponLabel = 'Free delivery';
      }
    } else if (cart.couponCode) {
      issues.push({ code: 'COUPON_INVALID', message: 'The promotion code on your bag is no longer valid.' });
    }
  }

  // Delivery
  let deliveryBase = 0;
  let estimatedDelivery = settings.delivery.estimateCopy;
  if (options.deliveryMethod !== 'PICKUP' && subtotalBase > 0) {
    const zone = options.deliveryZoneId
      ? await prisma.deliveryZone.findUnique({ where: { id: options.deliveryZoneId } })
      : await prisma.deliveryZone.findFirst({ where: { active: true }, orderBy: { position: 'asc' } });
    if (zone) {
      const qualifiesFree = zone.freeThreshold !== null && subtotalBase - discountBase >= zone.freeThreshold;
      deliveryBase = freeDelivery || qualifiesFree ? 0 : zone.fee;
      estimatedDelivery =
        zone.minDays === zone.maxDays
          ? `Delivered in ${zone.minDays} working day${zone.minDays === 1 ? '' : 's'}`
          : `Delivered in ${zone.minDays}–${zone.maxDays} working days`;
    }
  } else if (options.deliveryMethod === 'PICKUP') {
    estimatedDelivery = 'Ready for collection within 4 working hours';
  }

  const threshold = settings.delivery.freeDeliveryThreshold;
  const remainingBase = threshold ? Math.max(0, threshold - (subtotalBase - discountBase)) : null;

  const totalBase = Math.max(0, subtotalBase - discountBase) + deliveryBase;

  return {
    id: cart.id,
    token: cart.token,
    lines,
    itemCount: cart.items.reduce((sum, i) => sum + i.quantity, 0),
    issues,
    estimatedDelivery,
    totals: {
      subtotal: convert(subtotalBase, base, display),
      discountTotal: convert(discountBase, base, display),
      deliveryTotal: convert(deliveryBase, base, display),
      taxTotal: 0,
      grandTotal: convert(totalBase, base, display),
      currency: display.code,
      freeDeliveryRemaining: remainingBase === null ? null : convert(remainingBase, base, display),
      couponCode: cart.couponCode,
      couponLabel,
    },
  };
}

/** Base-currency totals used when writing an order. Never presented. */
export async function computeOrderTotals(
  cart: CartWithItems,
  options: PriceCartOptions = {},
): Promise<{
  subtotal: number;
  discountTotal: number;
  deliveryTotal: number;
  taxTotal: number;
  grandTotal: number;
  currency: string;
  couponCode: string | null;
}> {
  const base = await getBaseCurrency();
  const dto = await priceCart(cart, { ...options, displayCurrency: base.code });
  return {
    subtotal: dto.totals.subtotal,
    discountTotal: dto.totals.discountTotal,
    deliveryTotal: dto.totals.deliveryTotal,
    taxTotal: dto.totals.taxTotal,
    grandTotal: dto.totals.grandTotal,
    currency: base.code,
    couponCode: dto.totals.couponCode,
  };
}

export { type CartWithItems, CART_INCLUDE };
