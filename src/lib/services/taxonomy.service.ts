import type { z } from 'zod';
import { prisma } from '../db';
import { AppError, notFound } from '../errors';
import { decodeJson, encodeJson } from '../json';
import { toMinor } from '../money';
import { slugify, uniqueSlug } from '../utils';
import type {
  attributeSchema,
  brandSchema,
  categorySchema,
  couponInputSchema,
  deliveryZoneSchema,
  seriesSchema,
} from '../validation';

/**
 * Taxonomy and merchandising.
 *
 * Categories, brands, series, attributes, coupons and delivery zones. All of
 * it is data the merchant owns — adding "Laptops" with a RAM axis is done
 * here, from the admin, with no deployment.
 */

// ------------------------------------------------------------------ Category

export async function listCategories() {
  return prisma.category.findMany({
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: {
      parent: { select: { id: true, name: true } },
      attributes: { include: { attribute: { select: { id: true, key: true, name: true } } } },
      _count: { select: { products: true } },
    },
  });
}

export async function createCategory(input: z.infer<typeof categorySchema>) {
  const slug = await uniqueSlug(input.slug || input.name, async (candidate) => {
    return !!(await prisma.category.findUnique({ where: { slug: candidate } }));
  });

  return prisma.category.create({
    data: {
      name: input.name,
      slug,
      description: input.description ?? null,
      parentId: input.parentId ?? null,
      imageUrl: input.imageUrl ?? null,
      position: input.position,
      active: input.active,
      showInNav: input.showInNav,
      attributes: {
        create: (input.attributeIds ?? []).map((attributeId, index) => ({ attributeId, position: index * 10 })),
      },
    },
  });
}

export async function updateCategory(id: string, input: Partial<z.infer<typeof categorySchema>>) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw notFound('Category not found.');

  if (input.parentId === id) {
    throw new AppError('VALIDATION_ERROR', 'A category cannot be its own parent.');
  }

  if (input.attributeIds) {
    await prisma.categoryAttribute.deleteMany({ where: { categoryId: id } });
    await prisma.categoryAttribute.createMany({
      data: input.attributeIds.map((attributeId, index) => ({ categoryId: id, attributeId, position: index * 10 })),
    });
  }

  return prisma.category.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug ? { slug: slugify(input.slug) } : {}),
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId ?? null } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl ?? null } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.showInNav !== undefined ? { showInNav: input.showInNav } : {}),
    },
  });
}

export async function deleteCategory(id: string) {
  const count = await prisma.product.count({ where: { categoryId: id } });
  if (count > 0) {
    return { blocked: `That category still holds ${count} product(s). Move or delete them first.` };
  }
  await prisma.categoryAttribute.deleteMany({ where: { categoryId: id } });
  await prisma.category.delete({ where: { id } });
}

// --------------------------------------------------------------------- Brand

export async function listBrands() {
  return prisma.brand.findMany({
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true, series: true } } },
  });
}

export async function createBrand(input: z.infer<typeof brandSchema>) {
  const slug = await uniqueSlug(input.slug || input.name, async (candidate) => {
    return !!(await prisma.brand.findUnique({ where: { slug: candidate } }));
  });
  return prisma.brand.create({
    data: {
      name: input.name,
      slug,
      logoUrl: input.logoUrl ?? null,
      description: input.description ?? null,
      active: input.active,
      position: input.position,
    },
  });
}

export async function updateBrand(id: string, input: Partial<z.infer<typeof brandSchema>>) {
  return prisma.brand.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug ? { slug: slugify(input.slug) } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl ?? null } : {}),
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
    },
  });
}

export async function deleteBrand(id: string) {
  const count = await prisma.product.count({ where: { brandId: id } });
  if (count > 0) return { blocked: `That brand still has ${count} product(s).` };
  await prisma.series.deleteMany({ where: { brandId: id } });
  await prisma.brand.delete({ where: { id } });
}

// -------------------------------------------------------------------- Series

export async function listSeries() {
  return prisma.series.findMany({
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: {
      brand: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      _count: { select: { products: true } },
    },
  });
}

export async function createSeries(input: z.infer<typeof seriesSchema>) {
  const slug = await uniqueSlug(input.slug || input.name, async (candidate) => {
    return !!(await prisma.series.findUnique({ where: { slug: candidate } }));
  });
  return prisma.series.create({
    data: {
      name: input.name,
      slug,
      brandId: input.brandId,
      categoryId: input.categoryId,
      year: input.year ?? null,
      position: input.position,
      active: input.active,
    },
  });
}

export async function updateSeries(id: string, input: Partial<z.infer<typeof seriesSchema>>) {
  return prisma.series.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug ? { slug: slugify(input.slug) } : {}),
      ...(input.brandId !== undefined ? { brandId: input.brandId } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.year !== undefined ? { year: input.year ?? null } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}

export async function deleteSeries(id: string) {
  const count = await prisma.product.count({ where: { seriesId: id } });
  if (count > 0) return { blocked: `That series still has ${count} product(s).` };
  await prisma.series.delete({ where: { id } });
}

// ----------------------------------------------------------------- Attribute

export async function listAttributes() {
  const rows = await prisma.attributeDefinition.findMany({
    orderBy: { position: 'asc' },
    include: {
      values: { orderBy: { position: 'asc' } },
      categories: { include: { category: { select: { id: true, name: true } } } },
    },
  });
  return rows.map((row) => ({
    ...row,
    values: row.values.map((value) => ({
      ...value,
      hex: decodeJson<{ hex?: string }>(value.meta, {}).hex ?? null,
    })),
  }));
}

export async function createAttribute(input: z.infer<typeof attributeSchema>) {
  const existing = await prisma.attributeDefinition.findUnique({ where: { key: input.key } });
  if (existing) throw new AppError('CONFLICT', `An attribute with the key “${input.key}” already exists.`);

  return prisma.attributeDefinition.create({
    data: {
      key: input.key,
      name: input.name,
      inputType: input.inputType,
      unit: input.unit ?? null,
      isVariantAxis: input.isVariantAxis,
      isFilterable: input.isFilterable,
      showInSpecs: input.showInSpecs,
      position: input.position,
      values: {
        create: (input.values ?? []).map((value, index) => ({
          value: value.value,
          label: value.label,
          position: value.position || index * 10,
          meta: value.hex ? encodeJson({ hex: value.hex }) : null,
        })),
      },
    },
    include: { values: true },
  });
}

export async function updateAttribute(id: string, input: Partial<z.infer<typeof attributeSchema>>) {
  if (input.values) {
    const existingValues = await prisma.attributeValue.findMany({ where: { attributeId: id } });
    const keep = new Set(input.values.map((v) => v.value));

    for (const value of existingValues) {
      if (keep.has(value.value)) continue;
      // A value in use by a variant must not vanish underneath it.
      const used = await prisma.variantAttributeValue.count({ where: { valueId: value.id } });
      if (used === 0) await prisma.attributeValue.delete({ where: { id: value.id } });
    }

    for (const [index, value] of input.values.entries()) {
      await prisma.attributeValue.upsert({
        where: { attributeId_value: { attributeId: id, value: value.value } },
        create: {
          attributeId: id,
          value: value.value,
          label: value.label,
          position: value.position || index * 10,
          meta: value.hex ? encodeJson({ hex: value.hex }) : null,
        },
        update: {
          label: value.label,
          position: value.position || index * 10,
          meta: value.hex ? encodeJson({ hex: value.hex }) : null,
        },
      });
    }
  }

  return prisma.attributeDefinition.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.inputType !== undefined ? { inputType: input.inputType } : {}),
      ...(input.unit !== undefined ? { unit: input.unit ?? null } : {}),
      ...(input.isVariantAxis !== undefined ? { isVariantAxis: input.isVariantAxis } : {}),
      ...(input.isFilterable !== undefined ? { isFilterable: input.isFilterable } : {}),
      ...(input.showInSpecs !== undefined ? { showInSpecs: input.showInSpecs } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
    },
    include: { values: { orderBy: { position: 'asc' } } },
  });
}

export async function deleteAttribute(id: string) {
  const used = await prisma.variantAttributeValue.count({ where: { attributeId: id } });
  if (used > 0) return { blocked: `That attribute is used by ${used} variant(s).` };
  await prisma.categoryAttribute.deleteMany({ where: { attributeId: id } });
  await prisma.productAttributeValue.deleteMany({ where: { attributeId: id } });
  await prisma.attributeValue.deleteMany({ where: { attributeId: id } });
  await prisma.attributeDefinition.delete({ where: { id } });
}

// -------------------------------------------------------------------- Coupon

export async function listCoupons() {
  return prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function createCoupon(input: z.infer<typeof couponInputSchema>) {
  const existing = await prisma.coupon.findUnique({ where: { code: input.code } });
  if (existing) throw new AppError('CONFLICT', 'That code already exists.');
  if (input.type === 'PERCENT' && (input.value < 1 || input.value > 100)) {
    throw new AppError('VALIDATION_ERROR', 'A percentage discount must be between 1 and 100.');
  }
  return prisma.coupon.create({
    data: {
      code: input.code,
      description: input.description ?? null,
      type: input.type,
      // A fixed discount arrives in major units from the form.
      value: input.type === 'PERCENT' ? input.value : toMinor(input.value / 100),
      minSubtotal: input.minSubtotal ?? null,
      maxDiscount: input.maxDiscount ?? null,
      maxRedemptions: input.maxRedemptions ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      active: input.active,
    },
  });
}

export async function updateCoupon(id: string, input: Partial<z.infer<typeof couponInputSchema>>) {
  return prisma.coupon.update({
    where: { id },
    data: {
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.minSubtotal !== undefined ? { minSubtotal: input.minSubtotal ?? null } : {}),
      ...(input.maxDiscount !== undefined ? { maxDiscount: input.maxDiscount ?? null } : {}),
      ...(input.maxRedemptions !== undefined ? { maxRedemptions: input.maxRedemptions ?? null } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt ?? null } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt ?? null } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}

export async function deleteCoupon(id: string) {
  await prisma.coupon.delete({ where: { id } });
}

// ------------------------------------------------------------- Delivery zone

export async function listDeliveryZones() {
  const rows = await prisma.deliveryZone.findMany({ orderBy: { position: 'asc' } });
  return rows.map((row) => ({ ...row, regions: decodeJson<string[]>(row.regions, []) }));
}

export async function createDeliveryZone(input: z.infer<typeof deliveryZoneSchema>) {
  return prisma.deliveryZone.create({
    data: {
      name: input.name,
      regions: encodeJson(input.regions),
      fee: toMinor(input.fee),
      freeThreshold: input.freeThreshold ? toMinor(input.freeThreshold) : null,
      minDays: input.minDays,
      maxDays: input.maxDays,
      pickupAvailable: input.pickupAvailable,
      active: input.active,
      position: input.position,
    },
  });
}

export async function updateDeliveryZone(id: string, input: Partial<z.infer<typeof deliveryZoneSchema>>) {
  return prisma.deliveryZone.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.regions !== undefined ? { regions: encodeJson(input.regions) } : {}),
      ...(input.fee !== undefined ? { fee: toMinor(input.fee) } : {}),
      ...(input.freeThreshold !== undefined
        ? { freeThreshold: input.freeThreshold ? toMinor(input.freeThreshold) : null }
        : {}),
      ...(input.minDays !== undefined ? { minDays: input.minDays } : {}),
      ...(input.maxDays !== undefined ? { maxDays: input.maxDays } : {}),
      ...(input.pickupAvailable !== undefined ? { pickupAvailable: input.pickupAvailable } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
    },
  });
}

export async function deleteDeliveryZone(id: string) {
  const count = await prisma.order.count({ where: { deliveryZoneId: id } });
  if (count > 0) return { blocked: `That zone is referenced by ${count} order(s). Deactivate it instead.` };
  await prisma.deliveryZone.delete({ where: { id } });
}

/** Everything the product form needs to populate its selects, in one call. */
export async function getTaxonomyBundle() {
  const [categories, brands, series, attributes] = await Promise.all([
    prisma.category.findMany({ orderBy: { position: 'asc' }, select: { id: true, name: true, slug: true } }),
    prisma.brand.findMany({ orderBy: { position: 'asc' }, select: { id: true, name: true, slug: true } }),
    prisma.series.findMany({
      orderBy: { position: 'asc' },
      select: { id: true, name: true, slug: true, brandId: true, categoryId: true },
    }),
    listAttributes(),
  ]);
  return { categories, brands, series, attributes };
}
