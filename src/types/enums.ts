/**
 * Enumerations.
 *
 * Stored as String in the database (SQLite/Postgres portability) and
 * constrained here + in Zod schemas at every boundary. Each list is exported
 * as a readonly tuple so Zod can build an enum from it directly.
 */

export const ROLE_KEYS = [
  'SUPER_ADMIN',
  'PRODUCT_MANAGER',
  'ORDER_MANAGER',
  'FINANCE',
  'SUPPORT',
  'CUSTOMER',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ADMIN_ROLE_KEYS: readonly RoleKey[] = [
  'SUPER_ADMIN',
  'PRODUCT_MANAGER',
  'ORDER_MANAGER',
  'FINANCE',
  'SUPPORT',
];

export const PRODUCT_CONDITIONS = [
  'NEW',
  'OPEN_BOX',
  'REFURBISHED_EXCELLENT',
  'REFURBISHED_GOOD',
  'PRE_OWNED',
] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const CONDITION_LABELS: Record<ProductCondition, string> = {
  NEW: 'New · Sealed',
  OPEN_BOX: 'Open box',
  REFURBISHED_EXCELLENT: 'Refurbished · Excellent',
  REFURBISHED_GOOD: 'Refurbished · Good',
  PRE_OWNED: 'Pre-owned',
};

export const ATTRIBUTE_INPUT_TYPES = [
  'SELECT',
  'MULTISELECT',
  'TEXT',
  'NUMBER',
  'BOOLEAN',
] as const;
export type AttributeInputType = (typeof ATTRIBUTE_INPUT_TYPES)[number];

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'READY',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  READY: 'Ready for delivery',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

/** Legal forward transitions. Enforced server-side in the order service. */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED', 'REFUNDED'],
  PROCESSING: ['READY', 'CANCELLED', 'REFUNDED'],
  READY: ['SHIPPED', 'CANCELLED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

export const PAYMENT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SUCCESSFUL',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SUCCESSFUL: 'Paid',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
};

/** Statuses after which no further provider callback may change the outcome. */
export const TERMINAL_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'SUCCESSFUL',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
];

export const FULFILLMENT_STATUSES = [
  'UNFULFILLED',
  'PICKING',
  'READY',
  'SHIPPED',
  'DELIVERED',
  'RETURNED',
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export const INVENTORY_MOVEMENT_TYPES = [
  'RECEIVE',
  'ADJUST',
  'SET',
  'RESERVE',
  'RELEASE',
  'FULFILL',
  'RETURN',
  'DAMAGE',
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const COUPON_TYPES = ['PERCENT', 'FIXED', 'FREE_DELIVERY'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export const DELIVERY_METHODS = ['DELIVERY', 'PICKUP'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const PRODUCT_SORTS = [
  'relevance',
  'newest',
  'price-asc',
  'price-desc',
  'name-asc',
  'bestselling',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const SORT_LABELS: Record<ProductSort, string> = {
  relevance: 'Relevance',
  newest: 'Newest first',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  'name-asc': 'Name: A–Z',
  bestselling: 'Best selling',
};
