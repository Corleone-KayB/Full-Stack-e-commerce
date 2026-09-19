import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { decodeJson } from '../json';
import { convert } from '../money';
import { getBaseCurrency, getDisplayCurrency } from './currency.service';
import { describeStock } from './inventory.service';
import { effectivePrice, PRICING_INCLUDE } from './pricing.service';
import { CONDITION_LABELS, type ProductCondition } from '@/types/enums';
import type {
  AttributeValueDTO,
  CatalogFacets,
  CatalogQuery,
  CatalogResult,
  ImageDTO,
  ProductDetailDTO,
  ProductSummaryDTO,
  SpecRow,
  VariantDTO,
} from '@/types/catalog';

/**
 * Catalogue reads.
 *
 * Nothing here knows what an iPhone is. Filtering is driven entirely by
 * category / brand / series rows and by variant-axis attributes, so adding
 * laptops or watches needs data, not code.
 */

const PRODUCT_INCLUDE = {
  brand: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
  series: { select: { id: true, name: true, slug: true } },
  images: { orderBy: { position: 'asc' as const } },
  variants: {
    where: { active: true },
    orderBy: { position: 'asc' as const },
    include: {
      ...PRICING_INCLUDE,
      inventory: true,
      attributes: { include: { attribute: true, value: true } },
    },
  },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

function toAttributeValueDTO(value: { id: string; value: string; label: string; meta: string | null }): AttributeValueDTO {
  const meta = decodeJson<{ hex?: string }>(value.meta, {});
  return { id: value.id, value: value.value, label: value.label, hex: meta.hex ?? null };
}

function imageDto(image: { id: string; url: string; alt: string | null; variantId: string | null }, fallbackAlt: string): ImageDTO {
  return { id: image.id, url: image.url, alt: image.alt ?? fallbackAlt, variantId: image.variantId };
}

interface Money {
  base: Awaited<ReturnType<typeof getBaseCurrency>>;
  display: Awaited<ReturnType<typeof getDisplayCurrency>>;
}

function buildVariantDTOs(product: ProductWithRelations, money: Money, now: Date): VariantDTO[] {
  return product.variants.map((variant) => {
    const price = effectivePrice(variant, now);
    const attributes: Record<string, AttributeValueDTO> = {};
    for (const link of variant.attributes) {
      attributes[link.attribute.key] = toAttributeValueDTO(link.value);
    }
    return {
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      price,
      displayPrice: convert(price.price, money.base, money.display),
      displayCompareAt: price.compareAtPrice ? convert(price.compareAtPrice, money.base, money.display) : null,
      displayCurrency: money.display.code,
      imageUrl: variant.imageUrl,
      batteryHealth: variant.batteryHealth,
      stock: variant.inventory ? describeStock(variant.inventory) : null,
      attributes,
      active: variant.active,
    };
  });
}

function summarise(product: ProductWithRelations, money: Money, now: Date): ProductSummaryDTO {
  const variants = buildVariantDTOs(product, money, now);
  const sellable = variants.filter((v) => (v.stock?.available ?? 0) > 0);
  const pool = sellable.length ? sellable : variants;
  const cheapest = [...pool].sort((a, b) => a.displayPrice - b.displayPrice)[0];

  const totalAvailable = variants.reduce((sum, v) => sum + (v.stock?.available ?? 0), 0);
  const anyLow = variants.some((v) => v.stock?.status === 'LOW_STOCK');
  const stockStatus: ProductSummaryDTO['stockStatus'] =
    totalAvailable <= 0 ? 'OUT_OF_STOCK' : anyLow && totalAvailable <= 5 ? 'LOW_STOCK' : 'IN_STOCK';

  // Which axes exist is derived from the data, so a new category's axes appear
  // on cards automatically.
  const axisMap = new Map<string, Set<string>>();
  for (const variant of variants) {
    for (const [key, value] of Object.entries(variant.attributes)) {
      if (!axisMap.has(key)) axisMap.set(key, new Set());
      axisMap.get(key)!.add(value.label);
    }
  }

  const primaryImage = product.images.find((i) => !i.variantId) ?? product.images[0];

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    category: product.category,
    series: product.series,
    condition: product.condition as ProductCondition,
    shortDescription: product.shortDescription,
    featured: product.featured,
    bestseller: product.bestseller,
    newArrival: product.newArrival,
    image: primaryImage ? imageDto(primaryImage, product.name) : null,
    fromPrice: cheapest?.displayPrice ?? 0,
    fromCompareAt: cheapest?.displayCompareAt ?? null,
    displayCurrency: money.display.code,
    discountPercent: cheapest?.price.discountPercent ?? null,
    promotionLabel: cheapest?.price.promotionLabel ?? null,
    variantCount: variants.length,
    axisSummary: [...axisMap.entries()].map(([key, values]) => ({
      key,
      label: key,
      values: [...values],
    })),
    stockStatus,
    totalAvailable,
    warrantyMonths: product.warrantyMonths,
  };
}

async function money(currency?: string | null): Promise<Money> {
  const [base, display] = await Promise.all([getBaseCurrency(), getDisplayCurrency(currency)]);
  return { base, display };
}

// ---------------------------------------------------------------------------
// Listing + filtering
// ---------------------------------------------------------------------------

function buildWhere(query: CatalogQuery): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [{ active: true }, { variants: { some: { active: true } } }];

  if (query.category?.length) and.push({ category: { slug: { in: query.category } } });
  if (query.brand?.length) and.push({ brand: { slug: { in: query.brand } } });
  if (query.series?.length) and.push({ series: { slug: { in: query.series } } });
  if (query.condition?.length) and.push({ condition: { in: query.condition } });
  if (query.featured) and.push({ featured: true });
  if (query.bestseller) and.push({ bestseller: true });
  if (query.newArrival) and.push({ newArrival: true });

  // Attribute filters are AND across attributes, OR within one attribute:
  // "256 GB or 512 GB, in Titanium".
  for (const [key, values] of Object.entries(query.attributes ?? {})) {
    if (!values.length) continue;
    and.push({
      variants: {
        some: {
          active: true,
          attributes: { some: { attribute: { key }, value: { value: { in: values } } } },
        },
      },
    });
  }

  if (typeof query.minPrice === 'number' || typeof query.maxPrice === 'number') {
    and.push({
      variants: {
        some: {
          active: true,
          price: {
            ...(typeof query.minPrice === 'number' ? { gte: query.minPrice } : {}),
            ...(typeof query.maxPrice === 'number' ? { lte: query.maxPrice } : {}),
          },
        },
      },
    });
  }

  if (query.q) {
    const terms = tokenise(query.q);
    for (const term of terms) {
      and.push({
        OR: [
          { name: { contains: term } },
          { model: { contains: term } },
          { shortDescription: { contains: term } },
          { series: { name: { contains: term } } },
          { brand: { name: { contains: term } } },
          { variants: { some: { sku: { contains: term } } } },
          { variants: { some: { name: { contains: term } } } },
          { variants: { some: { attributes: { some: { value: { label: { contains: term } } } } } } },
        ],
      });
    }
  }

  return { AND: and };
}

/**
 * Splits a query into searchable tokens and expands the shorthand people
 * actually type: "iphone 13 128" → ["iphone","13","128gb"], "pro max" kept
 * whole so it does not match every Pro.
 */
export function tokenise(input: string): string[] {
  const cleaned = input.toLowerCase().replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const withStorage = cleaned.replace(/\b(\d{2,4})\s?(gb|tb)\b/g, '$1$2');
  const tokens = withStorage.split(' ').filter((t) => t.length > 0);
  return tokens.map((token) => (/^\d{2,4}$/.test(token) && Number(token) >= 64 ? `${token}gb` : token)).slice(0, 8);
}

const SORT_ORDER: Record<string, Prisma.ProductOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }],
  'name-asc': [{ name: 'asc' }],
  bestselling: [{ bestseller: 'desc' }, { viewCount: 'desc' }],
  relevance: [{ featured: 'desc' }, { position: 'asc' }, { createdAt: 'desc' }],
};

export async function listProducts(query: CatalogQuery): Promise<CatalogResult> {
  const page = Math.max(1, query.page ?? 1);
  const perPage = Math.min(60, Math.max(6, query.perPage ?? 12));
  const where = buildWhere(query);
  const m = await money(query.currency);
  const now = new Date();

  const priceSort = query.sort === 'price-asc' || query.sort === 'price-desc';

  // Price sorting must consider the *effective* price, which lives partly in
  // schedules — so for those two sorts we page in memory over a bounded set.
  if (priceSort) {
    const all = await prisma.product.findMany({ where, include: PRODUCT_INCLUDE, take: 500 });
    const summaries = all.map((p) => summarise(p, m, now));
    const filtered = applyPostFilters(summaries, query);
    filtered.sort((a, b) =>
      query.sort === 'price-asc' ? a.fromPrice - b.fromPrice : b.fromPrice - a.fromPrice,
    );
    const total = filtered.length;
    const items = filtered.slice((page - 1) * perPage, page * perPage);
    return {
      items,
      facets: await buildFacets(query),
      total,
      page,
      perPage,
      pageCount: Math.max(1, Math.ceil(total / perPage)),
      appliedFilterCount: countFilters(query),
    };
  }

  const orderBy = SORT_ORDER[query.sort ?? 'relevance'] ?? SORT_ORDER.relevance;
  const [rows, total, facets] = await Promise.all([
    prisma.product.findMany({
      where,
      include: PRODUCT_INCLUDE,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.product.count({ where }),
    buildFacets(query),
  ]);

  let items = rows.map((p) => summarise(p, m, now));
  items = applyPostFilters(items, query);

  return {
    items,
    facets,
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
    appliedFilterCount: countFilters(query),
  };
}

/** Availability depends on computed stock, so it is applied after mapping. */
function applyPostFilters(items: ProductSummaryDTO[], query: CatalogQuery): ProductSummaryDTO[] {
  if (query.availability === 'in-stock') return items.filter((i) => i.stockStatus !== 'OUT_OF_STOCK');
  return items;
}

function countFilters(query: CatalogQuery): number {
  let count = 0;
  count += query.category?.length ?? 0;
  count += query.brand?.length ?? 0;
  count += query.series?.length ?? 0;
  count += query.condition?.length ?? 0;
  for (const values of Object.values(query.attributes ?? {})) count += values.length;
  if (typeof query.minPrice === 'number' || typeof query.maxPrice === 'number') count += 1;
  if (query.availability === 'in-stock') count += 1;
  if (query.featured) count += 1;
  if (query.bestseller) count += 1;
  return count;
}

/**
 * Facets are computed against the full active catalogue (not the filtered
 * set), so a shopper can always widen a filter rather than hitting a dead end.
 */
export async function buildFacets(_query: CatalogQuery = {}): Promise<CatalogFacets> {
  const [seriesRows, brandRows, categoryRows, conditionRows, axisDefs, priceAgg, displayCurrency, baseCurrency] =
    await Promise.all([
      prisma.series.findMany({
        where: { active: true, products: { some: { active: true } } },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { products: { where: { active: true } } } } },
      }),
      prisma.brand.findMany({
        where: { active: true, products: { some: { active: true } } },
        orderBy: { name: 'asc' },
        include: { _count: { select: { products: { where: { active: true } } } } },
      }),
      prisma.category.findMany({
        where: { active: true, products: { some: { active: true } } },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { products: { where: { active: true } } } } },
      }),
      prisma.product.groupBy({ by: ['condition'], where: { active: true }, _count: true }),
      prisma.attributeDefinition.findMany({
        where: { isVariantAxis: true, isFilterable: true },
        orderBy: { position: 'asc' },
        include: { values: { orderBy: { position: 'asc' } } },
      }),
      prisma.productVariant.aggregate({
        where: { active: true, product: { active: true } },
        _min: { price: true },
        _max: { price: true },
      }),
      getDisplayCurrency(),
      getBaseCurrency(),
    ]);

  const axisCounts = await Promise.all(
    axisDefs.map(async (def) => {
      const counts = await prisma.variantAttributeValue.groupBy({
        by: ['valueId'],
        where: { attributeId: def.id, variant: { active: true, product: { active: true } } },
        _count: true,
      });
      const byId = new Map(counts.map((c) => [c.valueId, c._count]));
      return {
        key: def.key,
        name: def.name,
        options: def.values
          .map((v) => ({ value: v.value, label: v.label, count: byId.get(v.id) ?? 0 }))
          .filter((o) => o.count > 0),
      };
    }),
  );

  const min = priceAgg._min.price ?? 0;
  const max = priceAgg._max.price ?? 0;

  return {
    series: seriesRows.map((s) => ({ value: s.slug, label: s.name, count: s._count.products })),
    brands: brandRows.map((b) => ({ value: b.slug, label: b.name, count: b._count.products })),
    categories: categoryRows.map((c) => ({ value: c.slug, label: c.name, count: c._count.products })),
    conditions: conditionRows.map((c) => ({
      value: c.condition,
      label: CONDITION_LABELS[c.condition as ProductCondition] ?? c.condition,
      count: typeof c._count === 'number' ? c._count : 0,
    })),
    attributes: axisCounts.filter((a) => a.options.length > 0),
    price: {
      min: convert(min, baseCurrency, displayCurrency),
      max: convert(max, baseCurrency, displayCurrency),
      currency: displayCurrency.code,
    },
    availability: [
      { value: 'in-stock', label: 'In stock', count: 0 },
      { value: 'all', label: 'Everything', count: 0 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function getProductBySlug(slug: string, currency?: string): Promise<ProductDetailDTO | null> {
  const product = await prisma.product.findFirst({
    where: { slug, active: true },
    include: {
      ...PRODUCT_INCLUDE,
      attributes: { include: { attribute: true, value: true } },
    },
  });
  if (!product) return null;

  const m = await money(currency);
  const now = new Date();
  const summary = summarise(product as ProductWithRelations, m, now);
  const variants = buildVariantDTOs(product as ProductWithRelations, m, now);

  // Variant axes, in the order the merchant configured.
  const axisOrder = await prisma.attributeDefinition.findMany({
    where: { isVariantAxis: true },
    orderBy: { position: 'asc' },
  });
  const axes = axisOrder
    .map((def) => {
      const seen = new Map<string, AttributeValueDTO>();
      for (const variant of variants) {
        const value = variant.attributes[def.key];
        if (value) seen.set(value.id, value);
      }
      return { key: def.key, name: def.name, values: [...seen.values()] };
    })
    .filter((axis) => axis.values.length > 0);

  // Spec sheet: modelled attributes first, then free-form rows.
  const specs: SpecRow[] = [];
  for (const link of product.attributes) {
    if (!link.attribute.showInSpecs) continue;
    const value =
      link.value?.label ??
      (link.valueText || (link.valueNumber != null ? String(link.valueNumber) : null) ||
        (link.valueBool != null ? (link.valueBool ? 'Yes' : 'No') : null));
    if (value) {
      specs.push({
        group: 'Specifications',
        label: link.attribute.name + (link.attribute.unit ? ` (${link.attribute.unit})` : ''),
        value,
      });
    }
  }
  specs.push(...decodeJson<SpecRow[]>(product.specSheet, []));

  return {
    ...summary,
    description: product.description,
    images: product.images.map((i) => imageDto(i, product.name)),
    variants,
    axes,
    specs,
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
  };
}

export async function getRelatedProducts(product: ProductDetailDTO, limit = 4): Promise<ProductSummaryDTO[]> {
  const m = await money(product.displayCurrency);
  const rows = await prisma.product.findMany({
    where: {
      active: true,
      id: { not: product.id },
      OR: [
        { seriesId: product.series?.id ?? undefined },
        { categoryId: product.category.id, brandId: product.brand.id },
      ],
    },
    include: PRODUCT_INCLUDE,
    orderBy: [{ bestseller: 'desc' }, { position: 'asc' }],
    take: limit,
  });
  return rows.map((p) => summarise(p, m, new Date()));
}

export async function listCurated(
  kind: 'featured' | 'bestseller' | 'new' | 'deals',
  limit = 8,
  currency?: string,
): Promise<ProductSummaryDTO[]> {
  const where: Prisma.ProductWhereInput = { active: true };
  if (kind === 'featured') where.featured = true;
  if (kind === 'bestseller') where.bestseller = true;
  if (kind === 'new') where.newArrival = true;
  if (kind === 'deals') {
    where.variants = { some: { active: true, OR: [{ compareAtPrice: { not: null } }, { schedules: { some: { active: true } } }] } };
  }

  const rows = await prisma.product.findMany({
    where,
    include: PRODUCT_INCLUDE,
    orderBy: kind === 'new' ? [{ createdAt: 'desc' }] : [{ position: 'asc' }, { createdAt: 'desc' }],
    take: limit * 2,
  });
  const m = await money(currency);
  let items = rows.map((p) => summarise(p, m, new Date()));
  if (kind === 'deals') items = items.filter((i) => i.discountPercent !== null);
  return items.slice(0, limit);
}

export async function listSeriesWithCounts() {
  return prisma.series.findMany({
    where: { active: true, products: { some: { active: true } } },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: {
      brand: { select: { name: true, slug: true } },
      category: { select: { name: true, slug: true } },
      _count: { select: { products: { where: { active: true } } } },
    },
  });
}

// ---------------------------------------------------------------------------
// Search suggestions
// ---------------------------------------------------------------------------

export interface SearchSuggestion {
  type: 'product' | 'series' | 'category';
  label: string;
  sublabel?: string;
  href: string;
  imageUrl?: string | null;
  price?: number;
  currency?: string;
}

export async function suggest(term: string, limit = 6): Promise<SearchSuggestion[]> {
  const tokens = tokenise(term);
  if (!tokens.length) return [];

  const m = await money();
  const [products, series] = await Promise.all([
    prisma.product.findMany({
      where: buildWhere({ q: term }),
      include: PRODUCT_INCLUDE,
      take: limit,
      orderBy: [{ bestseller: 'desc' }, { featured: 'desc' }],
    }),
    prisma.series.findMany({
      where: { active: true, name: { contains: tokens[0] } },
      take: 3,
      include: { _count: { select: { products: { where: { active: true } } } } },
    }),
  ]);

  const now = new Date();
  const productSuggestions: SearchSuggestion[] = products.map((p) => {
    const summary = summarise(p, m, now);
    return {
      type: 'product',
      label: summary.name,
      sublabel: summary.series?.name ?? summary.brand.name,
      href: `/products/${summary.slug}`,
      imageUrl: summary.image?.url ?? null,
      price: summary.fromPrice,
      currency: summary.displayCurrency,
    };
  });

  const seriesSuggestions: SearchSuggestion[] = series.map((s) => ({
    type: 'series',
    label: s.name,
    sublabel: `${s._count.products} models`,
    href: `/shop?series=${s.slug}`,
  }));

  return [...productSuggestions, ...seriesSuggestions].slice(0, limit + 2);
}

/** Fire-and-forget view counter feeding "most viewed" analytics. */
export async function recordProductView(productId: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  await prisma
    .$transaction([
      prisma.product.update({ where: { id: productId }, data: { viewCount: { increment: 1 } } }),
      prisma.productViewStat.upsert({
        where: { productId_day: { productId, day } },
        create: { productId, day, views: 1 },
        update: { views: { increment: 1 } },
      }),
    ])
    .catch(() => undefined);
}
