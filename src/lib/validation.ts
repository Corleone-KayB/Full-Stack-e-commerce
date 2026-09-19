import { z } from 'zod';
import {
  ATTRIBUTE_INPUT_TYPES,
  COUPON_TYPES,
  DELIVERY_METHODS,
  ORDER_STATUSES,
  PRODUCT_CONDITIONS,
  PRODUCT_SORTS,
  ROLE_KEYS,
} from '@/types/enums';

/**
 * Validation schemas.
 *
 * Every request body and query string crosses one of these before it reaches
 * a service. Nothing downstream re-checks shape, so this file is the trust
 * boundary — keep it strict.
 */

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.').max(160);
export const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Enter a valid phone number.')
  .max(24)
  .regex(/^[0-9+()\-\s]+$/, 'Enter a valid phone number.');

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200)
  .regex(/[a-z]/, 'Include a lower-case letter.')
  .regex(/[A-Z]/, 'Include an upper-case letter.')
  .regex(/\d/, 'Include a number.');

/** Money arrives from admin forms as a major-unit string: "1,450.50". */
export const moneyInput = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''))))
  .refine((v) => Number.isFinite(v) && v >= 0, 'Enter a valid amount.');

export const idSchema = z.string().min(1).max(64);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: trimmed(60),
  lastName: trimmed(60),
  phone: phoneSchema.optional(),
  marketingOptIn: z.boolean().optional().default(false),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(200),
});

export const requestResetSchema = z.object({ email: emailSchema });

export const performResetSchema = z.object({
  token: z.string().min(10).max(200),
  password: passwordSchema,
});

export const updateProfileSchema = z.object({
  firstName: trimmed(60).optional(),
  lastName: trimmed(60).optional(),
  phone: phoneSchema.optional().nullable(),
  marketingOptIn: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export const addressSchema = z.object({
  firstName: trimmed(60),
  lastName: trimmed(60),
  phone: phoneSchema,
  line1: trimmed(160),
  line2: optionalText(160).nullable().optional(),
  city: trimmed(80),
  region: optionalText(80).nullable().optional(),
  postalCode: optionalText(20).nullable().optional(),
  country: z.string().trim().length(2).toUpperCase().default('AE'),
  label: optionalText(40).optional(),
  isDefault: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Catalogue queries
// ---------------------------------------------------------------------------

const csv = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    if (!v) return undefined;
    const list = Array.isArray(v) ? v : v.split(',');
    const cleaned = list.map((s) => s.trim()).filter(Boolean);
    return cleaned.length ? cleaned : undefined;
  });

export const catalogQuerySchema = z
  .object({
    q: optionalText(120),
    category: csv,
    brand: csv,
    series: csv,
    condition: csv,
    storage: csv,
    color: csv,
    ram: csv,
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    availability: z.enum(['in-stock', 'all']).optional(),
    featured: z.coerce.boolean().optional(),
    bestseller: z.coerce.boolean().optional(),
    sort: z.enum(PRODUCT_SORTS).optional(),
    page: z.coerce.number().int().min(1).max(500).optional(),
    perPage: z.coerce.number().int().min(6).max(60).optional(),
    currency: z.string().length(3).toUpperCase().optional(),
    view: optionalText(20),
  })
  .transform((v) => {
    const attributes: Record<string, string[]> = {};
    if (v.storage) attributes.storage = v.storage;
    if (v.color) attributes.color = v.color;
    if (v.ram) attributes.ram = v.ram;
    return { ...v, attributes };
  });

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(12).optional(),
});

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export const addToCartSchema = z.object({
  variantId: idSchema,
  quantity: z.coerce.number().int().min(1).max(20).default(1),
});

export const updateCartSchema = z.object({
  lineId: idSchema,
  quantity: z.coerce.number().int().min(0).max(20),
});

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().max(40).nullable(),
});

// ---------------------------------------------------------------------------
// Checkout & payments
// ---------------------------------------------------------------------------

export const createOrderSchema = z.object({
  email: emailSchema,
  phone: phoneSchema.optional(),
  deliveryMethod: z.enum(DELIVERY_METHODS).default('DELIVERY'),
  deliveryZoneId: idSchema.optional().nullable(),
  shippingAddress: addressSchema.nullable().optional(),
  billingAddress: addressSchema.nullable().optional(),
  customerNote: optionalText(500).optional(),
  /** Advisory only — the server recomputes and rejects a mismatch. */
  expectedTotal: z.coerce.number().int().min(0).optional(),
  createAccount: z.boolean().optional(),
  password: passwordSchema.optional(),
});

export const initiatePaymentSchema = z.object({
  orderId: idSchema,
  provider: z.string().trim().min(2).max(40),
  fields: z.record(z.string().max(120)).default({}),
});

export const refundSchema = z.object({
  paymentId: idSchema,
  amount: z.coerce.number().int().min(1).optional(),
  reason: optionalText(240).optional(),
});

// ---------------------------------------------------------------------------
// Admin — catalogue
// ---------------------------------------------------------------------------

export const variantInputSchema = z.object({
  id: idSchema.optional(),
  sku: trimmed(64),
  barcode: optionalText(64).nullable().optional(),
  name: trimmed(120),
  price: moneyInput,
  compareAtPrice: moneyInput.optional().nullable(),
  costPrice: moneyInput.optional().nullable(),
  position: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
  batteryHealth: z.coerce.number().int().min(0).max(100).optional().nullable(),
  imageUrl: optionalText(500).nullable().optional(),
  /** attributeKey → attributeValue (machine value). */
  attributes: z.record(z.string().max(60)).default({}),
  stock: z.coerce.number().int().min(0).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).max(1000).default(3),
});

export const productInputSchema = z.object({
  name: trimmed(160),
  slug: optionalText(160).optional(),
  brandId: idSchema,
  categoryId: idSchema,
  seriesId: idSchema.optional().nullable(),
  model: optionalText(80).nullable().optional(),
  shortDescription: optionalText(240).nullable().optional(),
  description: optionalText(8000).nullable().optional(),
  condition: z.enum(PRODUCT_CONDITIONS).default('NEW'),
  warrantyMonths: z.coerce.number().int().min(0).max(120).default(12),
  featured: z.boolean().default(false),
  bestseller: z.boolean().default(false),
  newArrival: z.boolean().default(false),
  active: z.boolean().default(true),
  position: z.coerce.number().int().min(0).default(0),
  metaTitle: optionalText(200).nullable().optional(),
  metaDescription: optionalText(320).nullable().optional(),
  specSheet: z
    .array(z.object({ group: z.string().max(60), label: z.string().max(80), value: z.string().max(200) }))
    .max(60)
    .optional(),
  images: z
    .array(z.object({ url: z.string().max(600), alt: optionalText(160).optional(), variantId: idSchema.optional().nullable() }))
    .max(20)
    .optional(),
  /** Non-variant product attributes: attributeKey → value. */
  attributes: z.record(z.string().max(200)).optional(),
  variants: z.array(variantInputSchema).min(1, 'A product needs at least one variant.').max(40),
});

export const productPatchSchema = productInputSchema.partial().extend({
  variants: z.array(variantInputSchema).max(40).optional(),
});

export const categorySchema = z.object({
  name: trimmed(80),
  slug: optionalText(80).optional(),
  description: optionalText(500).nullable().optional(),
  parentId: idSchema.nullable().optional(),
  imageUrl: optionalText(500).nullable().optional(),
  position: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
  showInNav: z.boolean().default(true),
  attributeIds: z.array(idSchema).max(40).optional(),
});

export const brandSchema = z.object({
  name: trimmed(80),
  slug: optionalText(80).optional(),
  logoUrl: optionalText(500).nullable().optional(),
  description: optionalText(500).nullable().optional(),
  active: z.boolean().default(true),
  position: z.coerce.number().int().min(0).default(0),
});

export const seriesSchema = z.object({
  name: trimmed(80),
  slug: optionalText(80).optional(),
  brandId: idSchema,
  categoryId: idSchema,
  year: z.coerce.number().int().min(1990).max(2100).optional().nullable(),
  position: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

export const attributeSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, 'Use lower-case letters, numbers and underscores.'),
  name: trimmed(60),
  inputType: z.enum(ATTRIBUTE_INPUT_TYPES).default('SELECT'),
  unit: optionalText(12).nullable().optional(),
  isVariantAxis: z.boolean().default(false),
  isFilterable: z.boolean().default(true),
  showInSpecs: z.boolean().default(true),
  position: z.coerce.number().int().min(0).default(0),
  values: z
    .array(
      z.object({
        value: z.string().trim().toLowerCase().min(1).max(60),
        label: trimmed(60),
        hex: optionalText(9).nullable().optional(),
        position: z.coerce.number().int().min(0).default(0),
      }),
    )
    .max(120)
    .optional(),
});

// ---------------------------------------------------------------------------
// Admin — operations
// ---------------------------------------------------------------------------

export const inventoryAdjustSchema = z.object({
  variantId: idSchema,
  mode: z.enum(['increase', 'decrease', 'set']),
  quantity: z.coerce.number().int().min(0).max(100000),
  reason: optionalText(200).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).max(1000).optional(),
  backorderable: z.boolean().optional(),
});

export const orderPatchSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  trackingNumber: optionalText(80).nullable().optional(),
  trackingUrl: optionalText(400).nullable().optional(),
  internalNote: optionalText(1000).nullable().optional(),
  note: optionalText(500).optional(),
  notifyCustomer: z.boolean().optional(),
});

export const couponInputSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(40),
  description: optionalText(200).nullable().optional(),
  type: z.enum(COUPON_TYPES),
  value: z.coerce.number().int().min(0),
  minSubtotal: z.coerce.number().int().min(0).optional().nullable(),
  maxDiscount: z.coerce.number().int().min(0).optional().nullable(),
  maxRedemptions: z.coerce.number().int().min(1).optional().nullable(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  active: z.boolean().default(true),
});

export const priceScheduleSchema = z.object({
  variantId: idSchema,
  label: optionalText(80).nullable().optional(),
  price: moneyInput,
  compareAtPrice: moneyInput.optional().nullable(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional().nullable(),
  priority: z.coerce.number().int().min(0).max(100).default(0),
  active: z.boolean().default(true),
});

export const deliveryZoneSchema = z.object({
  name: trimmed(80),
  regions: z.array(z.string().trim().max(60)).min(1),
  fee: moneyInput,
  freeThreshold: moneyInput.optional().nullable(),
  minDays: z.coerce.number().int().min(0).max(60).default(1),
  maxDays: z.coerce.number().int().min(0).max(90).default(3),
  pickupAvailable: z.boolean().default(false),
  active: z.boolean().default(true),
  position: z.coerce.number().int().min(0).default(0),
});

export const adminUserSchema = z.object({
  email: emailSchema,
  firstName: trimmed(60),
  lastName: trimmed(60),
  roleKey: z.enum(ROLE_KEYS),
  password: passwordSchema.optional(),
  active: z.boolean().default(true),
});

export const contentPageSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Use lower-case letters, numbers and hyphens.'),
  title: trimmed(160),
  body: z.string().min(1).max(60000),
  metaTitle: optionalText(200).nullable().optional(),
  metaDescription: optionalText(320).nullable().optional(),
  active: z.boolean().default(true),
  position: z.coerce.number().int().min(0).default(0),
});

export const settingsPatchSchema = z.object({
  group: z.enum([
    'store',
    'currency',
    'homepage',
    'trust',
    'delivery',
    'payments',
    'seo',
    'appearance',
    'notifications',
  ]),
  value: z.record(z.unknown()),
});

export const csvImportSchema = z.object({
  csv: z.string().min(1).max(4_000_000),
  mode: z.enum(['validate', 'commit']).default('validate'),
  updateExisting: z.boolean().default(true),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  perPage: z.coerce.number().int().min(5).max(100).default(25),
  q: optionalText(120),
  status: optionalText(40),
  sort: optionalText(40),
});
