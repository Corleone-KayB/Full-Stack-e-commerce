import type { Prisma } from '@/generated/prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError, notFound } from '../errors';
import { encodeJson, decodeJson } from '../json';
import { toMinor } from '../money';
import { slugify, uniqueSlug } from '../utils';
import type { productInputSchema, productPatchSchema } from '../validation';

/**
 * Product authoring.
 *
 * The write side of the catalogue. Everything a merchant can do to a product
 * from the admin happens here, in one transaction per product, so a partially
 * written product with orphan variants is not a state the database can reach.
 *
 * Variants are reconciled by id: those present in the payload are updated,
 * those missing are removed (unless they appear on an order, in which case
 * they are deactivated so order history stays readable).
 */

type ProductInput = z.infer<typeof productInputSchema>;
type ProductPatch = z.infer<typeof productPatchSchema>;

export const ADMIN_PRODUCT_INCLUDE = {
  brand: true,
  category: true,
  series: true,
  images: { orderBy: { position: 'asc' as const } },
  attributes: { include: { attribute: true, value: true } },
  variants: {
    orderBy: { position: 'asc' as const },
    include: {
      inventory: true,
      attributes: { include: { attribute: true, value: true } },
      schedules: { orderBy: { startsAt: 'desc' as const } },
    },
  },
} satisfies Prisma.ProductInclude;

export type AdminProduct = Prisma.ProductGetPayload<{ include: typeof ADMIN_PRODUCT_INCLUDE }>;

async function slugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const existing = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
  return !!existing && existing.id !== exceptId;
}

/** Resolves attributeKey → value into the AttributeValue rows a variant links to. */
async function resolveVariantAttributes(
  attributes: Record<string, string>,
): Promise<{ attributeId: string; valueId: string }[]> {
  const entries = Object.entries(attributes).filter(([, value]) => value);
  if (!entries.length) return [];

  const definitions = await prisma.attributeDefinition.findMany({
    where: { key: { in: entries.map(([key]) => key) } },
    include: { values: true },
  });

  const resolved: { attributeId: string; valueId: string }[] = [];
  for (const [key, rawValue] of entries) {
    const definition = definitions.find((d) => d.key === key);
    if (!definition) {
      throw new AppError('VALIDATION_ERROR', `Unknown attribute “${key}”. Create it under Catalog → Attributes.`);
    }
    const normalised = rawValue.trim().toLowerCase();
    let value = definition.values.find((v) => v.value === normalised);

    // A new option (a colour that did not exist) is created on the fly rather
    // than rejected — merchants should not have to leave the product form.
    if (!value) {
      value = await prisma.attributeValue.create({
        data: {
          attributeId: definition.id,
          value: normalised,
          label: rawValue.trim(),
          position: definition.values.length * 10,
        },
      });
    }
    resolved.push({ attributeId: definition.id, valueId: value.id });
  }
  return resolved;
}

async function resolveProductAttributes(
  attributes: Record<string, string>,
): Promise<Prisma.ProductAttributeValueCreateWithoutProductInput[]> {
  const entries = Object.entries(attributes).filter(([, value]) => value !== '');
  if (!entries.length) return [];

  const definitions = await prisma.attributeDefinition.findMany({
    where: { key: { in: entries.map(([key]) => key) } },
  });

  return entries.flatMap(([key, value]) => {
    const definition = definitions.find((d) => d.key === key);
    if (!definition) return [];
    return [{ attribute: { connect: { id: definition.id } }, valueText: value }];
  });
}

export async function createProduct(input: ProductInput, _userId: string): Promise<AdminProduct> {
  const slug = await uniqueSlug(input.slug || input.name, (candidate) => slugTaken(candidate));

  const skus = input.variants.map((v) => v.sku.trim());
  if (new Set(skus).size !== skus.length) {
    throw new AppError('VALIDATION_ERROR', 'Every variant needs a unique SKU.');
  }
  const clash = await prisma.productVariant.findFirst({ where: { sku: { in: skus } }, select: { sku: true } });
  if (clash) throw new AppError('CONFLICT', `SKU ${clash.sku} is already used by another product.`);

  const productAttributes = await resolveProductAttributes(input.attributes ?? {});
  const variantAttributes = await Promise.all(
    input.variants.map((variant) => resolveVariantAttributes(variant.attributes)),
  );

  const product = await prisma.$transaction(async (tx) => {
    const createdProduct = await tx.product.create({
      data: {
        name: input.name,
        slug,
        brandId: input.brandId,
        categoryId: input.categoryId,
        seriesId: input.seriesId ?? null,
        model: input.model ?? null,
        shortDescription: input.shortDescription ?? null,
        description: input.description ?? null,
        condition: input.condition,
        warrantyMonths: input.warrantyMonths,
        featured: input.featured,
        bestseller: input.bestseller,
        newArrival: input.newArrival,
        active: input.active,
        position: input.position,
        metaTitle: input.metaTitle ?? null,
        metaDescription: input.metaDescription ?? null,
        specSheet: input.specSheet ? encodeJson(input.specSheet) : null,
        publishedAt: input.active ? new Date() : null,
        attributes: { create: productAttributes },
        images: {
          create: (input.images ?? []).map((image, index) => ({
            url: image.url,
            alt: image.alt ?? input.name,
            position: index,
          })),
        },
      },
    });

    for (const [index, variant] of input.variants.entries()) {
      const createdVariant = await tx.productVariant.create({
        data: {
          productId: createdProduct.id,
          sku: variant.sku.trim(),
          barcode: variant.barcode ?? null,
          name: variant.name,
          price: toMinor(variant.price),
          compareAtPrice: variant.compareAtPrice ? toMinor(variant.compareAtPrice) : null,
          costPrice: variant.costPrice ? toMinor(variant.costPrice) : null,
          position: variant.position || index * 10,
          active: variant.active,
          batteryHealth: variant.batteryHealth ?? null,
          imageUrl: variant.imageUrl ?? null,
          attributes: { create: variantAttributes[index] },
        },
      });

      await tx.inventory.create({
        data: {
          variantId: createdVariant.id,
          onHand: variant.stock,
          lowStockThreshold: variant.lowStockThreshold,
        },
      });
      if (variant.stock > 0) {
        await tx.inventoryMovement.create({
          data: {
            variantId: createdVariant.id,
            type: 'RECEIVE',
            quantity: variant.stock,
            reason: 'Opening stock',
            referenceType: 'manual',
            resultingOnHand: variant.stock,
            resultingReserved: 0,
          },
        });
      }
    }

    return createdProduct;
  });

  return (await getAdminProduct(product.id))!;
}

export async function updateProduct(
  handle: string,
  input: ProductPatch,
  _userId: string,
): Promise<AdminProduct> {
  const existing = await getAdminProduct(handle);
  if (!existing) throw notFound('Product not found.');

  const data: Prisma.ProductUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined && input.slug) {
    const slug = slugify(input.slug);
    if (await slugTaken(slug, existing.id)) {
      throw new AppError('CONFLICT', 'Another product already uses that URL.');
    }
    data.slug = slug;
  }
  if (input.brandId !== undefined) data.brand = { connect: { id: input.brandId } };
  if (input.categoryId !== undefined) data.category = { connect: { id: input.categoryId } };
  if (input.seriesId !== undefined) {
    data.series = input.seriesId ? { connect: { id: input.seriesId } } : { disconnect: true };
  }
  for (const key of ['model', 'shortDescription', 'description', 'metaTitle', 'metaDescription'] as const) {
    if (input[key] !== undefined) data[key] = input[key] ?? null;
  }
  for (const key of ['condition', 'warrantyMonths', 'featured', 'bestseller', 'newArrival', 'position'] as const) {
    if (input[key] !== undefined) (data as Record<string, unknown>)[key] = input[key];
  }
  if (input.active !== undefined) {
    data.active = input.active;
    if (input.active && !existing.publishedAt) data.publishedAt = new Date();
  }
  if (input.specSheet !== undefined) data.specSheet = encodeJson(input.specSheet);

  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id: existing.id }, data });

    if (input.images) {
      await tx.productImage.deleteMany({ where: { productId: existing.id } });
      await tx.productImage.createMany({
        data: input.images.map((image, index) => ({
          productId: existing.id,
          url: image.url,
          alt: image.alt ?? existing.name,
          position: index,
        })),
      });
    }

    if (input.attributes) {
      await tx.productAttributeValue.deleteMany({ where: { productId: existing.id } });
      const resolved = await resolveProductAttributes(input.attributes);
      for (const attribute of resolved) {
        await tx.productAttributeValue.create({
          data: { product: { connect: { id: existing.id } }, ...attribute },
        });
      }
    }
  });

  if (input.variants) {
    await reconcileVariants(existing, input.variants);
  }

  return (await getAdminProduct(existing.id))!;
}

async function reconcileVariants(existing: AdminProduct, variants: NonNullable<ProductPatch['variants']>) {
  const keepIds = variants.map((v) => v.id).filter(Boolean) as string[];
  const removed = existing.variants.filter((v) => !keepIds.includes(v.id));

  for (const variant of removed) {
    const sold = await prisma.orderItem.count({ where: { variantId: variant.id } });
    if (sold > 0) {
      // Deactivate rather than delete: an order must keep pointing at the SKU
      // that was actually sold.
      await prisma.productVariant.update({ where: { id: variant.id }, data: { active: false } });
    } else {
      await prisma.productVariant.delete({ where: { id: variant.id } });
    }
  }

  for (const [index, variant] of variants.entries()) {
    const attributes = await resolveVariantAttributes(variant.attributes);

    if (variant.id) {
      const previous = existing.variants.find((v) => v.id === variant.id);
      await prisma.$transaction(async (tx) => {
        await tx.productVariant.update({
          where: { id: variant.id },
          data: {
            sku: variant.sku.trim(),
            barcode: variant.barcode ?? null,
            name: variant.name,
            price: toMinor(variant.price),
            compareAtPrice: variant.compareAtPrice ? toMinor(variant.compareAtPrice) : null,
            costPrice: variant.costPrice ? toMinor(variant.costPrice) : null,
            position: variant.position || index * 10,
            active: variant.active,
            batteryHealth: variant.batteryHealth ?? null,
            imageUrl: variant.imageUrl ?? null,
          },
        });
        await tx.variantAttributeValue.deleteMany({ where: { variantId: variant.id! } });
        for (const attribute of attributes) {
          await tx.variantAttributeValue.create({ data: { variantId: variant.id!, ...attribute } });
        }

        // Stock is adjusted through the inventory service so a movement is
        // always written; here we only sync the threshold and any explicit
        // set from the product form.
        const inventory = previous?.inventory;
        if (inventory && inventory.onHand !== variant.stock) {
          await tx.inventory.update({
            where: { variantId: variant.id! },
            data: { onHand: variant.stock, lowStockThreshold: variant.lowStockThreshold },
          });
          await tx.inventoryMovement.create({
            data: {
              variantId: variant.id!,
              type: 'SET',
              quantity: variant.stock - inventory.onHand,
              reason: 'Set from product editor',
              referenceType: 'manual',
              resultingOnHand: variant.stock,
              resultingReserved: inventory.reserved,
            },
          });
        } else if (inventory) {
          await tx.inventory.update({
            where: { variantId: variant.id! },
            data: { lowStockThreshold: variant.lowStockThreshold },
          });
        }
      });
    } else {
      const clash = await prisma.productVariant.findUnique({ where: { sku: variant.sku.trim() } });
      if (clash) throw new AppError('CONFLICT', `SKU ${variant.sku} is already in use.`);

      const createdVariant = await prisma.productVariant.create({
        data: {
          productId: existing.id,
          sku: variant.sku.trim(),
          barcode: variant.barcode ?? null,
          name: variant.name,
          price: toMinor(variant.price),
          compareAtPrice: variant.compareAtPrice ? toMinor(variant.compareAtPrice) : null,
          costPrice: variant.costPrice ? toMinor(variant.costPrice) : null,
          position: variant.position || index * 10,
          active: variant.active,
          batteryHealth: variant.batteryHealth ?? null,
          imageUrl: variant.imageUrl ?? null,
          attributes: { create: attributes },
        },
      });
      await prisma.inventory.create({
        data: {
          variantId: createdVariant.id,
          onHand: variant.stock,
          lowStockThreshold: variant.lowStockThreshold,
        },
      });
    }
  }
}

export async function getAdminProduct(handle: string): Promise<AdminProduct | null> {
  return prisma.product.findFirst({
    where: { OR: [{ id: handle }, { slug: handle }] },
    include: ADMIN_PRODUCT_INCLUDE,
  });
}

export async function deleteProduct(handle: string): Promise<{ name: string; archived: boolean }> {
  const product = await getAdminProduct(handle);
  if (!product) throw notFound('Product not found.');

  const sold = await prisma.orderItem.count({
    where: { variantId: { in: product.variants.map((v) => v.id) } },
  });

  if (sold > 0) {
    await prisma.product.update({ where: { id: product.id }, data: { active: false } });
    return { name: product.name, archived: true };
  }

  await prisma.product.delete({ where: { id: product.id } });
  return { name: product.name, archived: false };
}

/** Copies a product and every variant, with fresh SKUs, as an inactive draft. */
export async function duplicateProduct(handle: string): Promise<AdminProduct> {
  const source = await getAdminProduct(handle);
  if (!source) throw notFound('Product not found.');

  const name = `${source.name} (copy)`;
  const slug = await uniqueSlug(name, (candidate) => slugTaken(candidate));
  const stamp = Date.now().toString(36).toUpperCase().slice(-4);

  const copy = await prisma.$transaction(async (tx) => {
    const createdProduct = await tx.product.create({
      data: {
        name,
        slug,
        brandId: source.brandId,
        categoryId: source.categoryId,
        seriesId: source.seriesId,
        model: source.model,
        shortDescription: source.shortDescription,
        description: source.description,
        condition: source.condition,
        warrantyMonths: source.warrantyMonths,
        featured: false,
        bestseller: false,
        newArrival: false,
        active: false, // a copy is a draft until someone publishes it
        position: source.position,
        specSheet: source.specSheet,
        metaTitle: source.metaTitle,
        metaDescription: source.metaDescription,
        images: {
          create: source.images.map((image) => ({
            url: image.url,
            alt: image.alt,
            position: image.position,
          })),
        },
        attributes: {
          create: source.attributes.map((attribute) => ({
            attributeId: attribute.attributeId,
            valueId: attribute.valueId,
            valueText: attribute.valueText,
            valueNumber: attribute.valueNumber,
            valueBool: attribute.valueBool,
          })),
        },
      },
    });

    for (const variant of source.variants) {
      const createdVariant = await tx.productVariant.create({
        data: {
          productId: createdProduct.id,
          sku: `${variant.sku}-${stamp}`,
          name: variant.name,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          costPrice: variant.costPrice,
          position: variant.position,
          active: variant.active,
          batteryHealth: variant.batteryHealth,
          imageUrl: variant.imageUrl,
          attributes: {
            create: variant.attributes.map((a) => ({ attributeId: a.attributeId, valueId: a.valueId })),
          },
        },
      });
      await tx.inventory.create({
        data: { variantId: createdVariant.id, onHand: 0, lowStockThreshold: variant.inventory?.lowStockThreshold ?? 3 },
      });
    }

    return createdProduct;
  });

  return (await getAdminProduct(copy.id))!;
}

// ---------------------------------------------------------------------------
// Admin listing
// ---------------------------------------------------------------------------

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  brand: string;
  series: string | null;
  category: string;
  active: boolean;
  featured: boolean;
  bestseller: boolean;
  variantCount: number;
  minPrice: number;
  maxPrice: number;
  totalStock: number;
  lowStock: boolean;
  imageUrl: string | null;
  updatedAt: Date;
}

export async function listAdminProducts(options: {
  page?: number;
  perPage?: number;
  q?: string;
  status?: string;
  categoryId?: string;
  seriesId?: string;
}): Promise<{ rows: AdminProductRow[]; total: number; page: number; perPage: number }> {
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(100, options.perPage ?? 25);

  const where: Prisma.ProductWhereInput = {};
  if (options.q) {
    where.OR = [
      { name: { contains: options.q } },
      { slug: { contains: options.q } },
      { variants: { some: { sku: { contains: options.q } } } },
    ];
  }
  if (options.status === 'active') where.active = true;
  if (options.status === 'draft') where.active = false;
  if (options.status === 'featured') where.featured = true;
  if (options.categoryId) where.categoryId = options.categoryId;
  if (options.seriesId) where.seriesId = options.seriesId;

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        brand: { select: { name: true } },
        series: { select: { name: true } },
        category: { select: { name: true } },
        images: { orderBy: { position: 'asc' }, take: 1 },
        variants: { include: { inventory: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    total,
    page,
    perPage,
    rows: rows.map((product) => {
      const prices = product.variants.map((v) => v.price);
      const stock = product.variants.reduce((sum, v) => sum + (v.inventory?.onHand ?? 0), 0);
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        brand: product.brand.name,
        series: product.series?.name ?? null,
        category: product.category.name,
        active: product.active,
        featured: product.featured,
        bestseller: product.bestseller,
        variantCount: product.variants.length,
        minPrice: prices.length ? Math.min(...prices) : 0,
        maxPrice: prices.length ? Math.max(...prices) : 0,
        totalStock: stock,
        lowStock: product.variants.some(
          (v) => v.inventory && v.inventory.onHand > 0 && v.inventory.onHand <= v.inventory.lowStockThreshold,
        ),
        imageUrl: product.images[0]?.url ?? null,
        updatedAt: product.updatedAt,
      };
    }),
  };
}

/** Spec rows, decoded for the editor. */
export function readSpecSheet(product: AdminProduct) {
  return decodeJson<{ group: string; label: string; value: string }[]>(product.specSheet, []);
}
