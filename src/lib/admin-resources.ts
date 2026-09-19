import type { CrudResource } from './admin-crud';
import {
  attributeSchema,
  brandSchema,
  categorySchema,
  couponInputSchema,
  deliveryZoneSchema,
  seriesSchema,
} from './validation';
import {
  createAttribute,
  createBrand,
  createCategory,
  createCoupon,
  createDeliveryZone,
  createSeries,
  deleteAttribute,
  deleteBrand,
  deleteCategory,
  deleteCoupon,
  deleteDeliveryZone,
  deleteSeries,
  listAttributes,
  listBrands,
  listCategories,
  listCoupons,
  listDeliveryZones,
  listSeries,
  updateAttribute,
  updateBrand,
  updateCategory,
  updateCoupon,
  updateDeliveryZone,
  updateSeries,
} from './services/taxonomy.service';

/**
 * Resource definitions for the admin CRUD factory.
 *
 * Kept out of route files because Next.js route modules may only export HTTP
 * handlers and route config — anything else fails the build.
 */

const named = (row: unknown) => (row as { name?: string; code?: string; key?: string }).name
  ?? (row as { code?: string }).code
  ?? (row as { key?: string }).key
  ?? 'item';

export const categoryResource: CrudResource = {
  entity: 'category',
  permission: { read: 'product:read', write: 'taxonomy:write' },
  schema: categorySchema,
  auditAction: 'taxonomy.changed',
  list: () => listCategories(),
  create: (input) => createCategory(input as Parameters<typeof createCategory>[0]),
  update: (id, input) => updateCategory(id, input as Parameters<typeof updateCategory>[1]),
  remove: (id) => deleteCategory(id),
  describe: named,
};

export const brandResource: CrudResource = {
  entity: 'brand',
  permission: { read: 'product:read', write: 'taxonomy:write' },
  schema: brandSchema,
  auditAction: 'taxonomy.changed',
  list: () => listBrands(),
  create: (input) => createBrand(input as Parameters<typeof createBrand>[0]),
  update: (id, input) => updateBrand(id, input as Parameters<typeof updateBrand>[1]),
  remove: (id) => deleteBrand(id),
  describe: named,
};

export const seriesResource: CrudResource = {
  entity: 'series',
  permission: { read: 'product:read', write: 'taxonomy:write' },
  schema: seriesSchema,
  auditAction: 'taxonomy.changed',
  list: () => listSeries(),
  create: (input) => createSeries(input as Parameters<typeof createSeries>[0]),
  update: (id, input) => updateSeries(id, input as Parameters<typeof updateSeries>[1]),
  remove: (id) => deleteSeries(id),
  describe: named,
};

export const attributeResource: CrudResource = {
  entity: 'attribute',
  permission: { read: 'product:read', write: 'taxonomy:write' },
  schema: attributeSchema,
  auditAction: 'taxonomy.changed',
  list: () => listAttributes(),
  create: (input) => createAttribute(input as Parameters<typeof createAttribute>[0]),
  update: (id, input) => updateAttribute(id, input as Parameters<typeof updateAttribute>[1]),
  remove: (id) => deleteAttribute(id),
  describe: named,
};

export const couponResource: CrudResource = {
  entity: 'coupon',
  permission: { read: 'order:read', write: 'marketing:write' },
  schema: couponInputSchema,
  auditAction: 'coupon.changed',
  list: () => listCoupons(),
  create: (input) => createCoupon(input as Parameters<typeof createCoupon>[0]),
  update: (id, input) => updateCoupon(id, input as Parameters<typeof updateCoupon>[1]),
  remove: (id) => deleteCoupon(id).then(() => undefined),
  describe: named,
};

export const deliveryZoneResource: CrudResource = {
  entity: 'delivery zone',
  permission: { read: 'settings:read', write: 'settings:write' },
  schema: deliveryZoneSchema,
  auditAction: 'settings.updated',
  list: () => listDeliveryZones(),
  create: (input) => createDeliveryZone(input as Parameters<typeof createDeliveryZone>[0]),
  update: (id, input) => updateDeliveryZone(id, input as Parameters<typeof updateDeliveryZone>[1]),
  remove: (id) => deleteDeliveryZone(id),
  describe: named,
};

// ------------------------------------------------------------------- Content

import { z } from 'zod';
import { prisma } from './db';
import { contentPageSchema } from './validation';

export const contentPageResource: CrudResource = {
  entity: 'page',
  permission: { read: 'settings:read', write: 'content:write' },
  schema: contentPageSchema,
  auditAction: 'content.updated',
  list: () => prisma.contentPage.findMany({ orderBy: { position: 'asc' } }),
  create: (input) => prisma.contentPage.create({ data: input as never }),
  update: (id, input) => prisma.contentPage.update({ where: { id }, data: input as never }),
  remove: async (id) => {
    await prisma.contentPage.delete({ where: { id } });
  },
  describe: (row) => (row as { title?: string }).title ?? 'page',
};

const faqSchema = z.object({
  question: z.string().trim().min(3).max(300),
  answer: z.string().trim().min(3).max(4000),
  topic: z.string().trim().max(40).default('general'),
  position: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

export const faqResource: CrudResource = {
  entity: 'FAQ',
  permission: { read: 'settings:read', write: 'content:write' },
  schema: faqSchema,
  auditAction: 'content.updated',
  list: () => prisma.faq.findMany({ orderBy: { position: 'asc' } }),
  create: (input) => prisma.faq.create({ data: input as never }),
  update: (id, input) => prisma.faq.update({ where: { id }, data: input as never }),
  remove: async (id) => {
    await prisma.faq.delete({ where: { id } });
  },
  describe: (row) => (row as { question?: string }).question ?? 'FAQ',
};

const bannerSchema = z.object({
  title: z.string().trim().min(2).max(160),
  subtitle: z.string().trim().max(300).optional().nullable(),
  imageUrl: z.string().trim().max(600).optional().nullable(),
  ctaLabel: z.string().trim().max(60).optional().nullable(),
  ctaHref: z.string().trim().max(300).optional().nullable(),
  placement: z.string().trim().max(40).default('home_hero'),
  position: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

export const bannerResource: CrudResource = {
  entity: 'banner',
  permission: { read: 'settings:read', write: 'content:write' },
  schema: bannerSchema,
  auditAction: 'content.updated',
  list: () => prisma.banner.findMany({ orderBy: { position: 'asc' } }),
  create: (input) => prisma.banner.create({ data: input as never }),
  update: (id, input) => prisma.banner.update({ where: { id }, data: input as never }),
  remove: async (id) => {
    await prisma.banner.delete({ where: { id } });
  },
  describe: (row) => (row as { title?: string }).title ?? 'banner',
};
