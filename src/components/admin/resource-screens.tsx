'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui';
import { ResourceManager, type ResourceConfig } from './resource-manager';
import { COUPON_TYPES, ATTRIBUTE_INPUT_TYPES } from '@/types/enums';

/**
 * Screen definitions.
 *
 * Each taxonomy screen is a configuration, not a component: the shared
 * ResourceManager renders the table, the dialog and the confirmations. Adding
 * "Collections" later is a new entry here plus a CRUD resource on the server.
 */

type Row = { id: string } & Record<string, unknown>;

export function CategoriesScreen({
  rows,
  attributes,
  canWrite,
}: {
  rows: Row[];
  attributes: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const config: ResourceConfig<Row> = {
    title: 'Categories',
    singular: 'Category',
    endpoint: '/api/admin/categories',
    description:
      'The top level of the catalogue. A category decides which attributes a product in it can use — that is how a Laptops category gets a RAM axis without touching code.',
    canWrite,
    emptyBody: 'Create a category before adding products.',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Laptops' },
      { name: 'slug', label: 'URL slug', type: 'text', hint: 'Leave blank to generate from the name.' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'position', label: 'Sort position', type: 'number', defaultValue: 0 },
      { name: 'active', label: 'Active', type: 'boolean', defaultValue: true },
      { name: 'showInNav', label: 'Show in navigation', type: 'boolean', defaultValue: true },
    ],
    columns: [
      {
        key: 'name',
        header: 'Category',
        render: (row) => (
          <span>
            <span className="block font-medium">{String(row.name)}</span>
            <span className="block text-xs text-muted">/{String(row.slug)}</span>
          </span>
        ),
      },
      {
        key: 'attributes',
        header: 'Attributes',
        hideBelow: 'md',
        render: (row) => {
          const list = (row.attributes as { attribute: { name: string } }[]) ?? [];
          return list.length ? (
            <span className="flex flex-wrap gap-1">
              {list.slice(0, 4).map((link, index) => (
                <Badge key={index} tone="outline">
                  {link.attribute.name}
                </Badge>
              ))}
            </span>
          ) : (
            <span className="text-xs text-faint">None</span>
          );
        },
      },
      {
        key: 'products',
        header: 'Products',
        numeric: true,
        render: (row) => (row._count as { products: number })?.products ?? 0,
      },
      {
        key: 'active',
        header: 'Status',
        render: (row) => <Badge tone={row.active ? 'positive' : 'neutral'}>{row.active ? 'Active' : 'Hidden'}</Badge>,
      },
    ],
    toForm: (row) => ({
      name: row.name,
      slug: row.slug,
      description: row.description ?? '',
      position: row.position,
      active: row.active,
      showInNav: row.showInNav,
    }),
    footnote: (
      <>
        Which attributes a category offers is edited under{' '}
        <Link href="/admin/catalog/attributes" className="text-accent underline underline-offset-4">
          Attributes
        </Link>
        . {attributes.length} attribute{attributes.length === 1 ? '' : 's'} are defined.
      </>
    ),
  };

  return <ResourceManager config={config} rows={rows} />;
}

export function BrandsScreen({ rows, canWrite }: { rows: Row[]; canWrite: boolean }) {
  const config: ResourceConfig<Row> = {
    title: 'Brands',
    singular: 'Brand',
    endpoint: '/api/admin/brands',
    description: 'Manufacturers. Adding Samsung or Google here is all that is needed before listing their devices.',
    canWrite,
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Samsung' },
      { name: 'slug', label: 'URL slug', type: 'text', hint: 'Leave blank to generate.' },
      { name: 'logoUrl', label: 'Logo URL', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'position', label: 'Sort position', type: 'number', defaultValue: 0 },
      { name: 'active', label: 'Active', type: 'boolean', defaultValue: true },
    ],
    columns: [
      { key: 'name', header: 'Brand', render: (row) => <span className="font-medium">{String(row.name)}</span> },
      { key: 'slug', header: 'Slug', hideBelow: 'sm', render: (row) => <span className="text-muted">/{String(row.slug)}</span> },
      {
        key: 'products',
        header: 'Products',
        numeric: true,
        render: (row) => (row._count as { products: number })?.products ?? 0,
      },
      {
        key: 'series',
        header: 'Series',
        numeric: true,
        hideBelow: 'md',
        render: (row) => (row._count as { series: number })?.series ?? 0,
      },
      {
        key: 'active',
        header: 'Status',
        render: (row) => <Badge tone={row.active ? 'positive' : 'neutral'}>{row.active ? 'Active' : 'Hidden'}</Badge>,
      },
    ],
    toForm: (row) => ({
      name: row.name,
      slug: row.slug,
      logoUrl: row.logoUrl ?? '',
      description: row.description ?? '',
      position: row.position,
      active: row.active,
    }),
  };

  return <ResourceManager config={config} rows={rows} />;
}

export function SeriesScreen({
  rows,
  brands,
  categories,
  canWrite,
}: {
  rows: Row[];
  brands: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const config: ResourceConfig<Row> = {
    title: 'Series',
    singular: 'Series',
    endpoint: '/api/admin/series',
    description:
      'Product lines within a brand — iPhone 16, Galaxy S25, MacBook Air. Series drive the storefront navigation and the shop filters.',
    canWrite,
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Galaxy S25' },
      { name: 'slug', label: 'URL slug', type: 'text' },
      {
        name: 'brandId',
        label: 'Brand',
        type: 'select',
        required: true,
        options: brands.map((brand) => ({ value: brand.id, label: brand.name })),
      },
      {
        name: 'categoryId',
        label: 'Category',
        type: 'select',
        required: true,
        options: categories.map((category) => ({ value: category.id, label: category.name })),
      },
      { name: 'year', label: 'Year', type: 'number', placeholder: '2026' },
      { name: 'position', label: 'Sort position', type: 'number', defaultValue: 0 },
      { name: 'active', label: 'Active', type: 'boolean', defaultValue: true },
    ],
    columns: [
      { key: 'name', header: 'Series', render: (row) => <span className="font-medium">{String(row.name)}</span> },
      {
        key: 'brand',
        header: 'Brand',
        hideBelow: 'sm',
        render: (row) => <span className="text-muted">{(row.brand as { name: string })?.name}</span>,
      },
      {
        key: 'category',
        header: 'Category',
        hideBelow: 'md',
        render: (row) => <span className="text-muted">{(row.category as { name: string })?.name}</span>,
      },
      { key: 'year', header: 'Year', numeric: true, hideBelow: 'lg', render: (row) => String(row.year ?? '—') },
      {
        key: 'products',
        header: 'Products',
        numeric: true,
        render: (row) => (row._count as { products: number })?.products ?? 0,
      },
    ],
    toForm: (row) => ({
      name: row.name,
      slug: row.slug,
      brandId: (row.brand as { id: string })?.id,
      categoryId: (row.category as { id: string })?.id,
      year: row.year ?? '',
      position: row.position,
      active: row.active,
    }),
  };

  return <ResourceManager config={config} rows={rows} />;
}

export function AttributesScreen({ rows, canWrite }: { rows: Row[]; canWrite: boolean }) {
  const config: ResourceConfig<Row> = {
    title: 'Attributes',
    singular: 'Attribute',
    endpoint: '/api/admin/attributes',
    description:
      'The properties products can have. Mark one as a variant axis and it generates purchasable variants — Storage and Colour do that for phones; add RAM and it will do the same for laptops.',
    canWrite,
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Memory' },
      {
        name: 'key',
        label: 'Key',
        type: 'text',
        required: true,
        hint: 'Lower-case, no spaces. Used in URLs and filters — cannot be changed later.',
        placeholder: 'ram',
      },
      {
        name: 'inputType',
        label: 'Input type',
        type: 'select',
        options: ATTRIBUTE_INPUT_TYPES.map((type) => ({ value: type, label: type.toLowerCase() })),
        defaultValue: 'SELECT',
      },
      { name: 'unit', label: 'Unit', type: 'text', placeholder: 'GB' },
      {
        name: 'isVariantAxis',
        label: 'Generates variants',
        type: 'boolean',
        hint: 'Each value becomes part of a SKU with its own price and stock.',
        defaultValue: false,
      },
      { name: 'isFilterable', label: 'Show as a shop filter', type: 'boolean', defaultValue: true },
      { name: 'showInSpecs', label: 'Show in the spec sheet', type: 'boolean', defaultValue: true },
      { name: 'position', label: 'Sort position', type: 'number', defaultValue: 0 },
    ],
    columns: [
      {
        key: 'name',
        header: 'Attribute',
        render: (row) => (
          <span>
            <span className="block font-medium">{String(row.name)}</span>
            <span className="block font-mono text-xs text-muted">{String(row.key)}</span>
          </span>
        ),
      },
      {
        key: 'values',
        header: 'Values',
        hideBelow: 'sm',
        render: (row) => {
          const values = (row.values as { id: string; label: string; hex?: string | null }[]) ?? [];
          return values.length ? (
            <span className="flex flex-wrap gap-1">
              {values.slice(0, 6).map((value) => (
                <Badge key={value.id} tone="outline">
                  {value.label}
                </Badge>
              ))}
              {values.length > 6 && <span className="text-xs text-faint">+{values.length - 6}</span>}
            </span>
          ) : (
            <span className="text-xs text-faint">No values yet</span>
          );
        },
      },
      {
        key: 'axis',
        header: 'Role',
        render: (row) => (
          <Badge tone={row.isVariantAxis ? 'accent' : 'neutral'}>
            {row.isVariantAxis ? 'Variant axis' : 'Specification'}
          </Badge>
        ),
      },
    ],
    toForm: (row) => ({
      name: row.name,
      key: row.key,
      inputType: row.inputType,
      unit: row.unit ?? '',
      isVariantAxis: row.isVariantAxis,
      isFilterable: row.isFilterable,
      showInSpecs: row.showInSpecs,
      position: row.position,
    }),
    footnote:
      'Values (128 GB, Titanium, 16 GB…) are added from the product editor as you use them, so you rarely need to manage them here.',
  };

  return <ResourceManager config={config} rows={rows} />;
}

export function CouponsScreen({ rows, canWrite, currencyCode }: { rows: Row[]; canWrite: boolean; currencyCode: string }) {
  const config: ResourceConfig<Row> = {
    title: 'Coupons',
    singular: 'Coupon',
    endpoint: '/api/admin/coupons',
    description: 'Discount codes customers enter in the bag. Every redemption is counted and capped server-side.',
    canWrite,
    fields: [
      { name: 'code', label: 'Code', type: 'text', required: true, placeholder: 'WELCOME10' },
      { name: 'description', label: 'Description', type: 'text', placeholder: '10% off your first order' },
      {
        name: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: COUPON_TYPES.map((type) => ({ value: type, label: type.replace(/_/g, ' ').toLowerCase() })),
        defaultValue: 'PERCENT',
      },
      { name: 'value', label: 'Value', type: 'number', hint: `Percent for PERCENT, ${currencyCode} for FIXED.` },
      { name: 'minSubtotal', label: 'Minimum subtotal (minor units)', type: 'number' },
      { name: 'maxDiscount', label: 'Maximum discount (minor units)', type: 'number' },
      { name: 'maxRedemptions', label: 'Redemption limit', type: 'number' },
      { name: 'startsAt', label: 'Starts', type: 'date' },
      { name: 'endsAt', label: 'Ends', type: 'date' },
      { name: 'active', label: 'Active', type: 'boolean', defaultValue: true },
    ],
    columns: [
      {
        key: 'code',
        header: 'Code',
        render: (row) => (
          <span>
            <span className="block font-mono font-medium">{String(row.code)}</span>
            <span className="block text-xs text-muted">{String(row.description ?? '')}</span>
          </span>
        ),
      },
      {
        key: 'type',
        header: 'Type',
        render: (row) => <Badge tone="outline">{String(row.type).replace(/_/g, ' ').toLowerCase()}</Badge>,
      },
      { key: 'value', header: 'Value', numeric: true, render: (row) => String(row.value) },
      {
        key: 'used',
        header: 'Used',
        numeric: true,
        render: (row) => `${row.usedCount}${row.maxRedemptions ? ` / ${row.maxRedemptions}` : ''}`,
      },
      {
        key: 'active',
        header: 'Status',
        render: (row) => <Badge tone={row.active ? 'positive' : 'neutral'}>{row.active ? 'Active' : 'Off'}</Badge>,
      },
    ],
    toForm: (row) => ({
      code: row.code,
      description: row.description ?? '',
      type: row.type,
      value: row.value,
      minSubtotal: row.minSubtotal ?? '',
      maxDiscount: row.maxDiscount ?? '',
      maxRedemptions: row.maxRedemptions ?? '',
      startsAt: row.startsAt ?? '',
      endsAt: row.endsAt ?? '',
      active: row.active,
    }),
  };

  return <ResourceManager config={config} rows={rows} />;
}

export function PagesScreen({ rows, canWrite }: { rows: Row[]; canWrite: boolean }) {
  const config: ResourceConfig<Row> = {
    title: 'Pages',
    singular: 'Page',
    endpoint: '/api/admin/pages',
    description:
      'Terms, privacy, returns, delivery, warranty and anything else. Written in a small Markdown subset — headings, lists, bold, links.',
    canWrite,
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'slug', label: 'URL slug', type: 'text', required: true, hint: 'Appears at /pages/<slug>' },
      { name: 'body', label: 'Content', type: 'textarea', required: true, wide: true },
      { name: 'metaTitle', label: 'Meta title', type: 'text' },
      { name: 'metaDescription', label: 'Meta description', type: 'text' },
      { name: 'position', label: 'Sort position', type: 'number', defaultValue: 0 },
      { name: 'active', label: 'Published', type: 'boolean', defaultValue: true },
    ],
    columns: [
      {
        key: 'title',
        header: 'Page',
        render: (row) => (
          <span>
            <span className="block font-medium">{String(row.title)}</span>
            <span className="block text-xs text-muted">/pages/{String(row.slug)}</span>
          </span>
        ),
      },
      {
        key: 'updated',
        header: 'Updated',
        hideBelow: 'sm',
        render: (row) => (
          <span className="text-muted">
            {new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(
              new Date(String(row.updatedAt)),
            )}
          </span>
        ),
      },
      {
        key: 'active',
        header: 'Status',
        render: (row) => <Badge tone={row.active ? 'positive' : 'neutral'}>{row.active ? 'Live' : 'Draft'}</Badge>,
      },
    ],
    toForm: (row) => ({
      title: row.title,
      slug: row.slug,
      body: row.body,
      metaTitle: row.metaTitle ?? '',
      metaDescription: row.metaDescription ?? '',
      position: row.position,
      active: row.active,
    }),
  };

  return <ResourceManager config={config} rows={rows} />;
}

export function FaqsScreen({ rows, canWrite }: { rows: Row[]; canWrite: boolean }) {
  const config: ResourceConfig<Row> = {
    title: 'FAQs',
    singular: 'FAQ',
    endpoint: '/api/admin/faqs',
    description:
      'Shown on the FAQ page, on product pages and on the homepage — and published as structured data so they can appear in search results.',
    canWrite,
    fields: [
      { name: 'question', label: 'Question', type: 'text', required: true, wide: true },
      { name: 'answer', label: 'Answer', type: 'textarea', required: true, wide: true },
      {
        name: 'topic',
        label: 'Topic',
        type: 'select',
        options: ['general', 'products', 'payment', 'delivery', 'warranty', 'returns'].map((topic) => ({
          value: topic,
          label: topic,
        })),
        defaultValue: 'general',
      },
      { name: 'position', label: 'Sort position', type: 'number', defaultValue: 0 },
      { name: 'active', label: 'Published', type: 'boolean', defaultValue: true },
    ],
    columns: [
      { key: 'question', header: 'Question', render: (row) => <span className="font-medium">{String(row.question)}</span> },
      { key: 'topic', header: 'Topic', hideBelow: 'sm', render: (row) => <Badge tone="outline">{String(row.topic)}</Badge> },
      {
        key: 'active',
        header: 'Status',
        render: (row) => <Badge tone={row.active ? 'positive' : 'neutral'}>{row.active ? 'Live' : 'Hidden'}</Badge>,
      },
    ],
    toForm: (row) => ({
      question: row.question,
      answer: row.answer,
      topic: row.topic,
      position: row.position,
      active: row.active,
    }),
  };

  return <ResourceManager config={config} rows={rows} />;
}

export function BannersScreen({ rows, canWrite }: { rows: Row[]; canWrite: boolean }) {
  const config: ResourceConfig<Row> = {
    title: 'Banners',
    singular: 'Banner',
    endpoint: '/api/admin/banners',
    description: 'Promotional slots on the storefront.',
    canWrite,
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'subtitle', label: 'Subtitle', type: 'text' },
      { name: 'imageUrl', label: 'Image URL', type: 'text' },
      { name: 'ctaLabel', label: 'Button label', type: 'text' },
      { name: 'ctaHref', label: 'Button link', type: 'text', placeholder: '/shop?series=iphone-16' },
      {
        name: 'placement',
        label: 'Placement',
        type: 'select',
        options: [
          { value: 'home_hero', label: 'Home hero' },
          { value: 'home_promo', label: 'Home promotion' },
        ],
        defaultValue: 'home_hero',
      },
      { name: 'position', label: 'Sort position', type: 'number', defaultValue: 0 },
      { name: 'active', label: 'Active', type: 'boolean', defaultValue: true },
    ],
    columns: [
      { key: 'title', header: 'Banner', render: (row) => <span className="font-medium">{String(row.title)}</span> },
      {
        key: 'placement',
        header: 'Placement',
        hideBelow: 'sm',
        render: (row) => <Badge tone="outline">{String(row.placement).replace(/_/g, ' ')}</Badge>,
      },
      {
        key: 'active',
        header: 'Status',
        render: (row) => <Badge tone={row.active ? 'positive' : 'neutral'}>{row.active ? 'Live' : 'Off'}</Badge>,
      },
    ],
    toForm: (row) => ({
      title: row.title,
      subtitle: row.subtitle ?? '',
      imageUrl: row.imageUrl ?? '',
      ctaLabel: row.ctaLabel ?? '',
      ctaHref: row.ctaHref ?? '',
      placement: row.placement,
      position: row.position,
      active: row.active,
    }),
  };

  return <ResourceManager config={config} rows={rows} />;
}

export function DeliveryZonesScreen({
  rows,
  canWrite,
  currencyCode,
}: {
  rows: Row[];
  canWrite: boolean;
  currencyCode: string;
}) {
  const config: ResourceConfig<Row> = {
    title: 'Delivery zones',
    singular: 'Zone',
    endpoint: '/api/admin/delivery-zones',
    description: `Fees and lead times by region. Amounts are in ${currencyCode}. Nothing about delivery is hard-coded.`,
    canWrite,
    fields: [
      { name: 'name', label: 'Zone name', type: 'text', required: true, placeholder: 'Northern Emirates' },
      {
        name: 'regions',
        label: 'Regions',
        type: 'tags',
        hint: 'Comma separated — city names or ISO country codes.',
        wide: true,
      },
      { name: 'fee', label: `Delivery fee (${currencyCode})`, type: 'number', defaultValue: 0 },
      { name: 'freeThreshold', label: `Free above (${currencyCode})`, type: 'number' },
      { name: 'minDays', label: 'Fastest (days)', type: 'number', defaultValue: 1 },
      { name: 'maxDays', label: 'Slowest (days)', type: 'number', defaultValue: 3 },
      { name: 'pickupAvailable', label: 'Collection available', type: 'boolean', defaultValue: false },
      { name: 'active', label: 'Active', type: 'boolean', defaultValue: true },
      { name: 'position', label: 'Sort position', type: 'number', defaultValue: 0 },
    ],
    columns: [
      {
        key: 'name',
        header: 'Zone',
        render: (row) => (
          <span>
            <span className="block font-medium">{String(row.name)}</span>
            <span className="block text-xs text-muted">{(row.regions as string[])?.join(', ')}</span>
          </span>
        ),
      },
      { key: 'fee', header: 'Fee', numeric: true, render: (row) => (Number(row.fee) / 100).toFixed(2) },
      {
        key: 'free',
        header: 'Free above',
        numeric: true,
        hideBelow: 'sm',
        render: (row) => (row.freeThreshold ? (Number(row.freeThreshold) / 100).toFixed(2) : '—'),
      },
      {
        key: 'days',
        header: 'Lead time',
        hideBelow: 'md',
        render: (row) =>
          row.minDays === row.maxDays ? `${row.minDays} day` : `${row.minDays}–${row.maxDays} days`,
      },
      {
        key: 'active',
        header: 'Status',
        render: (row) => <Badge tone={row.active ? 'positive' : 'neutral'}>{row.active ? 'Active' : 'Off'}</Badge>,
      },
    ],
    toForm: (row) => ({
      name: row.name,
      regions: row.regions,
      fee: Number(row.fee) / 100,
      freeThreshold: row.freeThreshold ? Number(row.freeThreshold) / 100 : '',
      minDays: row.minDays,
      maxDays: row.maxDays,
      pickupAvailable: row.pickupAvailable,
      active: row.active,
      position: row.position,
    }),
  };

  return <ResourceManager config={config} rows={rows} />;
}
