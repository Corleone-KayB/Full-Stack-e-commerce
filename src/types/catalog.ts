import type { EffectivePrice } from '@/lib/services/pricing.service';
import type { StockView } from '@/lib/services/inventory.service';
import type { ProductCondition, ProductSort } from './enums';

/** Plain, serialisable shapes handed to client components. */

export interface AttributeValueDTO {
  id: string;
  value: string;
  label: string;
  hex?: string | null;
}

export interface VariantDTO {
  id: string;
  sku: string;
  name: string;
  price: EffectivePrice;
  /** Display-currency amounts, already converted server-side. */
  displayPrice: number;
  displayCompareAt: number | null;
  displayCurrency: string;
  imageUrl: string | null;
  batteryHealth: number | null;
  stock: StockView | null;
  /** attributeKey → value */
  attributes: Record<string, AttributeValueDTO>;
  active: boolean;
}

export interface ImageDTO {
  id: string;
  url: string;
  alt: string;
  variantId: string | null;
}

export interface SpecRow {
  group: string;
  label: string;
  value: string;
}

export interface ProductSummaryDTO {
  id: string;
  name: string;
  slug: string;
  brand: { id: string; name: string; slug: string };
  category: { id: string; name: string; slug: string };
  series: { id: string; name: string; slug: string } | null;
  condition: ProductCondition;
  shortDescription: string | null;
  featured: boolean;
  bestseller: boolean;
  newArrival: boolean;
  image: ImageDTO | null;
  /** Cheapest in-stock-first variant, used for the card price. */
  fromPrice: number;
  fromCompareAt: number | null;
  displayCurrency: string;
  discountPercent: number | null;
  promotionLabel: string | null;
  variantCount: number;
  /** Storage/colour chips shown on the card. */
  axisSummary: { key: string; label: string; values: string[] }[];
  stockStatus: StockView['status'];
  totalAvailable: number;
  warrantyMonths: number;
}

export interface ProductDetailDTO extends ProductSummaryDTO {
  description: string | null;
  images: ImageDTO[];
  variants: VariantDTO[];
  /** Ordered variant axes, e.g. Storage then Colour. */
  axes: { key: string; name: string; values: AttributeValueDTO[] }[];
  specs: SpecRow[];
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface CatalogFacets {
  series: FacetOption[];
  brands: FacetOption[];
  categories: FacetOption[];
  conditions: FacetOption[];
  /** Variant-axis facets, keyed by attribute (storage, color, …). */
  attributes: { key: string; name: string; options: FacetOption[] }[];
  price: { min: number; max: number; currency: string };
  availability: FacetOption[];
}

export interface CatalogQuery {
  q?: string;
  category?: string[];
  brand?: string[];
  series?: string[];
  condition?: string[];
  /** attributeKey → values, e.g. { storage: ['128gb','256gb'] } */
  attributes?: Record<string, string[]>;
  minPrice?: number;
  maxPrice?: number;
  availability?: 'in-stock' | 'all';
  featured?: boolean;
  bestseller?: boolean;
  newArrival?: boolean;
  sort?: ProductSort;
  page?: number;
  perPage?: number;
  currency?: string;
}

export interface CatalogResult {
  items: ProductSummaryDTO[];
  facets: CatalogFacets;
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
  appliedFilterCount: number;
}
