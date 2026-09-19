'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Check, GripVertical, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { ApiError, apiPatch, apiPost, errorMessage } from '@/lib/client-api';
import { cn, slugify } from '@/lib/utils';
import { useToast } from '@/components/providers';
import { Badge, Button, Checkbox, Field, Input, Select, Switch, Textarea } from '@/components/ui';
import { PRODUCT_CONDITIONS, CONDITION_LABELS } from '@/types/enums';

/**
 * Product editor.
 *
 * Eight steps, all on one page with a rail down the side, because a merchant
 * adding a product wants to see everything they have filled in — not click
 * "next" seven times. The rail marks which steps are complete and lets you
 * jump; nothing is gated.
 *
 * The variant matrix is the important part: pick the axis values a product
 * comes in (storage, colour, RAM — whatever the attributes table says) and it
 * generates every combination with its own SKU, price and stock. That is what
 * makes "add a laptop with RAM and storage" possible without a developer.
 */

export interface TaxonomyOption {
  id: string;
  name: string;
  slug?: string;
  brandId?: string;
  categoryId?: string;
}

export interface AttributeOption {
  id: string;
  key: string;
  name: string;
  isVariantAxis: boolean;
  inputType: string;
  unit: string | null;
  values: { id: string; value: string; label: string; hex?: string | null }[];
}

export interface VariantDraft {
  id?: string;
  sku: string;
  name: string;
  price: string;
  compareAtPrice: string;
  costPrice: string;
  stock: string;
  lowStockThreshold: string;
  active: boolean;
  batteryHealth: string;
  imageUrl: string;
  attributes: Record<string, string>;
}

export interface ProductDraft {
  id?: string;
  name: string;
  slug: string;
  brandId: string;
  categoryId: string;
  seriesId: string;
  model: string;
  shortDescription: string;
  description: string;
  condition: string;
  warrantyMonths: string;
  featured: boolean;
  bestseller: boolean;
  newArrival: boolean;
  active: boolean;
  metaTitle: string;
  metaDescription: string;
  images: { url: string; alt: string }[];
  specSheet: { group: string; label: string; value: string }[];
  attributes: Record<string, string>;
  variants: VariantDraft[];
}

export const EMPTY_DRAFT: ProductDraft = {
  name: '',
  slug: '',
  brandId: '',
  categoryId: '',
  seriesId: '',
  model: '',
  shortDescription: '',
  description: '',
  condition: 'NEW',
  warrantyMonths: '12',
  featured: false,
  bestseller: false,
  newArrival: false,
  active: false,
  metaTitle: '',
  metaDescription: '',
  images: [],
  specSheet: [],
  attributes: {},
  variants: [],
};

const STEPS = [
  { id: 'basics', label: 'Basic information' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'variants', label: 'Variants' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'images', label: 'Images' },
  { id: 'specs', label: 'Specifications' },
  { id: 'seo', label: 'SEO' },
  { id: 'publish', label: 'Publish' },
] as const;

export function ProductForm({
  initial,
  categories,
  brands,
  seriesList,
  attributes,
  currencyCode,
}: {
  initial: ProductDraft;
  categories: TaxonomyOption[];
  brands: TaxonomyOption[];
  seriesList: TaxonomyOption[];
  attributes: AttributeOption[];
  currencyCode: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = React.useState<ProductDraft>(initial);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [activeStep, setActiveStep] = React.useState<string>('basics');

  const isEdit = !!initial.id;
  const axes = attributes.filter((attribute) => attribute.isVariantAxis);
  const specAttributes = attributes.filter((attribute) => !attribute.isVariantAxis);

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const relevantSeries = seriesList.filter(
    (series) =>
      (!draft.categoryId || series.categoryId === draft.categoryId) &&
      (!draft.brandId || series.brandId === draft.brandId),
  );

  const complete = {
    basics: !!draft.name && !!draft.brandId && !!draft.categoryId,
    pricing: draft.variants.some((variant) => Number(variant.price) > 0),
    variants: draft.variants.length > 0,
    inventory: draft.variants.some((variant) => Number(variant.stock) > 0),
    images: draft.images.length > 0,
    specs: draft.specSheet.length > 0 || Object.values(draft.attributes).some(Boolean),
    seo: !!draft.metaTitle || !!draft.shortDescription,
    publish: draft.active,
  } as Record<string, boolean>;

  React.useEffect(() => {
    // Observe which section is on screen so the rail follows the scroll.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveStep(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -60% 0px' },
    );
    for (const step of STEPS) {
      const node = document.getElementById(step.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, []);

  async function save(publish?: boolean) {
    setSaving(true);
    setErrors({});

    const body = {
      name: draft.name,
      slug: draft.slug || undefined,
      brandId: draft.brandId,
      categoryId: draft.categoryId,
      seriesId: draft.seriesId || null,
      model: draft.model || null,
      shortDescription: draft.shortDescription || null,
      description: draft.description || null,
      condition: draft.condition,
      warrantyMonths: Number(draft.warrantyMonths) || 0,
      featured: draft.featured,
      bestseller: draft.bestseller,
      newArrival: draft.newArrival,
      active: publish ?? draft.active,
      metaTitle: draft.metaTitle || null,
      metaDescription: draft.metaDescription || null,
      images: draft.images.filter((image) => image.url.trim()),
      specSheet: draft.specSheet.filter((row) => row.label && row.value),
      attributes: Object.fromEntries(Object.entries(draft.attributes).filter(([, value]) => value)),
      variants: draft.variants.map((variant, index) => ({
        id: variant.id,
        sku: variant.sku.trim(),
        name: variant.name.trim() || 'Default',
        price: Number(variant.price) || 0,
        compareAtPrice: variant.compareAtPrice ? Number(variant.compareAtPrice) : null,
        costPrice: variant.costPrice ? Number(variant.costPrice) : null,
        stock: Number(variant.stock) || 0,
        lowStockThreshold: Number(variant.lowStockThreshold) || 3,
        active: variant.active,
        batteryHealth: variant.batteryHealth ? Number(variant.batteryHealth) : null,
        imageUrl: variant.imageUrl || null,
        position: index * 10,
        attributes: variant.attributes,
      })),
    };

    try {
      if (isEdit) {
        await apiPatch(`/api/products/${initial.id}`, body);
        toast.success('Saved', publish === true ? 'The product is live on the storefront.' : undefined);
        router.refresh();
      } else {
        const created = await apiPost<{ id: string }>('/api/products', body);
        toast.success('Product created', publish ? 'It is live on the storefront.' : 'Saved as a draft.');
        router.push(`/admin/products/${created.id}`);
      }
      if (publish !== undefined) set('active', publish);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        toast.error("Couldn't save", error.message);
      } else {
        toast.error("Couldn't save", errorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  }

  /** Builds the cartesian product of the chosen axis values. */
  function generateVariants(selection: Record<string, string[]>) {
    const keys = Object.keys(selection).filter((key) => selection[key].length > 0);
    if (!keys.length) return;

    let combinations: Record<string, string>[] = [{}];
    for (const key of keys) {
      combinations = combinations.flatMap((combo) => selection[key].map((value) => ({ ...combo, [key]: value })));
    }

    const base = slugify(draft.name || 'sku').toUpperCase().replace(/-/g, '').slice(0, 12) || 'SKU';
    const existing = new Map(
      draft.variants.map((variant) => [JSON.stringify(variant.attributes), variant] as const),
    );

    const next: VariantDraft[] = combinations.map((attrs, index) => {
      const key = JSON.stringify(attrs);
      const previous = existing.get(key);
      if (previous) return previous;

      const labels = keys.map((axisKey) => {
        const axis = axes.find((a) => a.key === axisKey);
        return axis?.values.find((value) => value.value === attrs[axisKey])?.label ?? attrs[axisKey];
      });

      return {
        sku: `${base}-${labels.map((l) => l.replace(/\s+/g, '').slice(0, 4).toUpperCase()).join('-')}` || `${base}-${index}`,
        name: labels.join(' · '),
        price: draft.variants[0]?.price ?? '',
        compareAtPrice: '',
        costPrice: '',
        stock: '0',
        lowStockThreshold: '3',
        active: true,
        batteryHealth: '',
        imageUrl: '',
        attributes: attrs,
      };
    });

    set('variants', next);
    toast.success(`${next.length} variant${next.length === 1 ? '' : 's'} ready`, 'Set the price and stock for each.');
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[200px_1fr]">
      <nav className="hidden xl:block" aria-label="Product sections">
        <ol className="sticky top-24 space-y-0.5">
          {STEPS.map((step, index) => (
            <li key={step.id}>
              <a
                href={`#${step.id}`}
                className={cn(
                  'flex items-center gap-2.5 rounded px-3 py-2 text-[13px] transition-colors',
                  activeStep === step.id ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-ink/5 hover:text-ink',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]',
                    complete[step.id] ? 'bg-accent text-accent-ink' : 'border border-hairline text-faint',
                  )}
                >
                  {complete[step.id] ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
                </span>
                {step.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-w-0 space-y-6">
        {/* ------------------------------------------------------- Basics */}
        <Section id="basics" title="Basic information" step={1}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name" required error={errors.name} className="sm:col-span-2">
              <Input
                value={draft.name}
                onChange={(event) => {
                  const name = event.target.value;
                  setDraft((current) => ({
                    ...current,
                    name,
                    slug: current.slug && current.id ? current.slug : slugify(name),
                  }));
                }}
                placeholder="iPhone 15 Pro"
                invalid={!!errors.name}
              />
            </Field>

            <Field label="Brand" required error={errors.brandId}>
              <Select value={draft.brandId} onChange={(event) => set('brandId', event.target.value)}>
                <option value="">Choose a brand…</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Category" required error={errors.categoryId}>
              <Select value={draft.categoryId} onChange={(event) => set('categoryId', event.target.value)}>
                <option value="">Choose a category…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Series" hint="Optional — groups models on the storefront.">
              <Select value={draft.seriesId} onChange={(event) => set('seriesId', event.target.value)}>
                <option value="">No series</option>
                {relevantSeries.map((series) => (
                  <option key={series.id} value={series.id}>
                    {series.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Model number">
              <Input value={draft.model} onChange={(event) => set('model', event.target.value)} placeholder="A3102" />
            </Field>

            <Field label="Condition">
              <Select value={draft.condition} onChange={(event) => set('condition', event.target.value)}>
                {PRODUCT_CONDITIONS.map((condition) => (
                  <option key={condition} value={condition}>
                    {CONDITION_LABELS[condition]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Warranty (months)">
              <Input
                type="number"
                min={0}
                value={draft.warrantyMonths}
                onChange={(event) => set('warrantyMonths', event.target.value)}
              />
            </Field>

            <Field
              label="Short description"
              hint="One sentence, shown on cards and in search results."
              className="sm:col-span-2"
            >
              <Input
                value={draft.shortDescription}
                onChange={(event) => set('shortDescription', event.target.value)}
                maxLength={240}
              />
            </Field>

            <Field label="Description" className="sm:col-span-2">
              <Textarea
                value={draft.description}
                onChange={(event) => set('description', event.target.value)}
                rows={5}
                placeholder="What makes this device worth buying. Two or three short paragraphs."
              />
            </Field>
          </div>
        </Section>

        {/* ------------------------------------------------------ Pricing */}
        <Section
          id="pricing"
          title="Pricing"
          step={2}
          hint={`Amounts in ${currencyCode}. Prices live on variants, so each storage size can differ.`}
        >
          {draft.variants.length === 0 ? (
            <p className="rounded border border-hairline bg-canvas px-4 py-6 text-center text-sm text-muted">
              Create variants first — every price belongs to a variant.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-hairline text-2xs uppercase tracking-[0.08em] text-faint">
                    <th className="py-2 pr-3 font-medium">Variant</th>
                    <th className="py-2 pr-3 font-medium">Price</th>
                    <th className="py-2 pr-3 font-medium">Compare at</th>
                    <th className="py-2 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.variants.map((variant, index) => (
                    <tr key={variant.id ?? index} className="border-b border-hairline last:border-0">
                      <td className="py-2 pr-3 text-ink">{variant.name}</td>
                      <td className="py-2 pr-3">
                        <Input
                          inputMode="decimal"
                          value={variant.price}
                          onChange={(event) => updateVariant(setDraft, index, { price: event.target.value })}
                          className="h-9 w-28 text-[13px]"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          inputMode="decimal"
                          value={variant.compareAtPrice}
                          onChange={(event) => updateVariant(setDraft, index, { compareAtPrice: event.target.value })}
                          placeholder="—"
                          className="h-9 w-28 text-[13px]"
                        />
                      </td>
                      <td className="py-2">
                        <Input
                          inputMode="decimal"
                          value={variant.costPrice}
                          onChange={(event) => updateVariant(setDraft, index, { costPrice: event.target.value })}
                          placeholder="—"
                          className="h-9 w-28 text-[13px]"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-faint">
                For a time-limited promotion use{' '}
                <a href="/admin/marketing/promotions" className="text-accent underline underline-offset-4">
                  scheduled pricing
                </a>{' '}
                rather than editing the price here — it can be previewed and rolled back.
              </p>
            </div>
          )}
        </Section>

        {/* ----------------------------------------------------- Variants */}
        <Section id="variants" title="Variants" step={3} hint="Each combination becomes its own SKU with its own price and stock.">
          <VariantBuilder axes={axes} onGenerate={generateVariants} current={draft.variants} />

          {draft.variants.length > 0 && (
            <ul className="mt-5 space-y-2">
              {draft.variants.map((variant, index) => (
                <li key={variant.id ?? index} className="rounded border border-hairline bg-canvas p-3.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <GripVertical className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                    <div className="min-w-[140px] flex-1">
                      <Input
                        value={variant.name}
                        onChange={(event) => updateVariant(setDraft, index, { name: event.target.value })}
                        className="h-9 text-[13px]"
                        aria-label="Variant name"
                      />
                    </div>
                    <Input
                      value={variant.sku}
                      onChange={(event) => updateVariant(setDraft, index, { sku: event.target.value })}
                      className="h-9 w-40 font-mono text-xs"
                      aria-label="SKU"
                      placeholder="SKU"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={variant.active}
                        onChange={(event) => updateVariant(setDraft, index, { active: event.target.checked })}
                        className="h-4 w-4 accent-[rgb(var(--accent))]"
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          'variants',
                          draft.variants.filter((_, i) => i !== index),
                        )
                      }
                      aria-label={`Remove ${variant.name}`}
                      className="rounded p-1.5 text-faint transition-colors hover:text-critical"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {Object.keys(variant.attributes).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                      {Object.entries(variant.attributes).map(([key, value]) => {
                        const axis = axes.find((a) => a.key === key);
                        const label = axis?.values.find((v) => v.value === value)?.label ?? value;
                        return (
                          <Badge key={key} tone="outline">
                            {axis?.name ?? key}: {label}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() =>
              set('variants', [
                ...draft.variants,
                {
                  sku: `${slugify(draft.name || 'sku').toUpperCase().replace(/-/g, '').slice(0, 12)}-${draft.variants.length + 1}`,
                  name: 'Default',
                  price: '',
                  compareAtPrice: '',
                  costPrice: '',
                  stock: '0',
                  lowStockThreshold: '3',
                  active: true,
                  batteryHealth: '',
                  imageUrl: '',
                  attributes: {},
                },
              ])
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add a single variant
          </Button>
        </Section>

        {/* ---------------------------------------------------- Inventory */}
        <Section id="inventory" title="Inventory" step={4} hint="Opening stock. Later adjustments are made in Inventory, where they are logged.">
          {draft.variants.length === 0 ? (
            <p className="rounded border border-hairline bg-canvas px-4 py-6 text-center text-sm text-muted">
              Create variants first.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-hairline text-2xs uppercase tracking-[0.08em] text-faint">
                    <th className="py-2 pr-3 font-medium">Variant</th>
                    <th className="py-2 pr-3 font-medium">In stock</th>
                    <th className="py-2 pr-3 font-medium">Low-stock at</th>
                    <th className="py-2 font-medium">Battery health %</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.variants.map((variant, index) => (
                    <tr key={variant.id ?? index} className="border-b border-hairline last:border-0">
                      <td className="py-2 pr-3 text-ink">{variant.name}</td>
                      <td className="py-2 pr-3">
                        <Input
                          type="number"
                          min={0}
                          value={variant.stock}
                          onChange={(event) => updateVariant(setDraft, index, { stock: event.target.value })}
                          className="h-9 w-24 text-[13px]"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          type="number"
                          min={0}
                          value={variant.lowStockThreshold}
                          onChange={(event) => updateVariant(setDraft, index, { lowStockThreshold: event.target.value })}
                          className="h-9 w-24 text-[13px]"
                        />
                      </td>
                      <td className="py-2">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={variant.batteryHealth}
                          onChange={(event) => updateVariant(setDraft, index, { batteryHealth: event.target.value })}
                          placeholder="—"
                          className="h-9 w-24 text-[13px]"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ------------------------------------------------------- Images */}
        <Section id="images" title="Images" step={5} hint="The first image is used on cards and in search results.">
          <ImageEditor images={draft.images} onChange={(images) => set('images', images)} />
        </Section>

        {/* -------------------------------------------------------- Specs */}
        <Section id="specs" title="Specifications" step={6}>
          {specAttributes.length > 0 && (
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              {specAttributes.map((attribute) => (
                <Field key={attribute.id} label={attribute.name + (attribute.unit ? ` (${attribute.unit})` : '')}>
                  <Input
                    value={draft.attributes[attribute.key] ?? ''}
                    onChange={(event) =>
                      set('attributes', { ...draft.attributes, [attribute.key]: event.target.value })
                    }
                  />
                </Field>
              ))}
            </div>
          )}

          <p className="eyebrow mb-2.5">Additional rows</p>
          <div className="space-y-2">
            {draft.specSheet.map((row, index) => (
              <div key={index} className="flex flex-wrap gap-2">
                <Input
                  value={row.group}
                  onChange={(event) => updateSpec(setDraft, index, { group: event.target.value })}
                  placeholder="Group"
                  className="h-9 w-36 text-[13px]"
                  aria-label="Specification group"
                />
                <Input
                  value={row.label}
                  onChange={(event) => updateSpec(setDraft, index, { label: event.target.value })}
                  placeholder="Label"
                  className="h-9 w-44 text-[13px]"
                  aria-label="Specification label"
                />
                <Input
                  value={row.value}
                  onChange={(event) => updateSpec(setDraft, index, { value: event.target.value })}
                  placeholder="Value"
                  className="h-9 min-w-[160px] flex-1 text-[13px]"
                  aria-label="Specification value"
                />
                <button
                  type="button"
                  onClick={() => set('specSheet', draft.specSheet.filter((_, i) => i !== index))}
                  aria-label="Remove specification row"
                  className="rounded p-2 text-faint transition-colors hover:text-critical"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => set('specSheet', [...draft.specSheet, { group: 'In the box', label: '', value: '' }])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add a row
          </Button>
        </Section>

        {/* ---------------------------------------------------------- SEO */}
        <Section id="seo" title="SEO" step={7}>
          <div className="grid gap-4">
            <Field label="URL" hint={`Storefront address: /products/${draft.slug || 'your-product'}`}>
              <Input
                value={draft.slug}
                onChange={(event) => set('slug', slugify(event.target.value))}
                placeholder="iphone-15-pro"
              />
            </Field>
            <Field label="Meta title" hint={`${draft.metaTitle.length}/60 characters`}>
              <Input
                value={draft.metaTitle}
                onChange={(event) => set('metaTitle', event.target.value)}
                maxLength={70}
                placeholder={draft.name}
              />
            </Field>
            <Field label="Meta description" hint={`${draft.metaDescription.length}/160 characters`}>
              <Textarea
                value={draft.metaDescription}
                onChange={(event) => set('metaDescription', event.target.value)}
                maxLength={200}
                rows={2}
                placeholder={draft.shortDescription}
              />
            </Field>

            <div className="rounded border border-hairline bg-canvas p-4">
              <p className="eyebrow mb-2">Search preview</p>
              <p className="text-[15px] text-info">{draft.metaTitle || draft.name || 'Product name'}</p>
              <p className="text-xs text-positive">aurum.store/products/{draft.slug || 'your-product'}</p>
              <p className="mt-1 text-[13px] text-muted">
                {draft.metaDescription || draft.shortDescription || 'Add a description to control what appears here.'}
              </p>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------ Publish */}
        <Section id="publish" title="Publish" step={8}>
          <div className="space-y-4">
            <Switch
              label="Live on the storefront"
              description="Unpublished products are visible only in this admin."
              checked={draft.active}
              onChange={(value) => set('active', value)}
            />
            <div className="border-t border-hairline pt-4">
              <Checkbox
                label="Featured"
                description="Appears in the featured rail on the homepage."
                checked={draft.featured}
                onChange={(event) => set('featured', event.target.checked)}
              />
            </div>
            <Checkbox
              label="Best seller"
              description="Shown in the best-sellers rail and badge."
              checked={draft.bestseller}
              onChange={(event) => set('bestseller', event.target.checked)}
            />
            <Checkbox
              label="New arrival"
              description="Shown in the new-arrivals rail."
              checked={draft.newArrival}
              onChange={(event) => set('newArrival', event.target.checked)}
            />
          </div>
        </Section>

        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-hairline bg-canvas/95 px-4 py-4 backdrop-blur-xl lg:-mx-8 lg:px-8">
          <Button onClick={() => save()} loading={saving} loadingLabel="Saving…">
            {isEdit ? 'Save changes' : 'Save draft'}
          </Button>
          {!draft.active && (
            <Button variant="accent" onClick={() => save(true)} loading={saving}>
              <Sparkles className="h-4 w-4" />
              Save and publish
            </Button>
          )}
          <span className="ml-auto text-xs text-faint">
            {draft.variants.length} variant{draft.variants.length === 1 ? '' : 's'} ·{' '}
            {draft.active ? 'live' : 'draft'}
          </span>
        </div>
      </div>
    </div>
  );
}

function updateVariant(
  setDraft: React.Dispatch<React.SetStateAction<ProductDraft>>,
  index: number,
  patch: Partial<VariantDraft>,
) {
  setDraft((current) => ({
    ...current,
    variants: current.variants.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)),
  }));
}

function updateSpec(
  setDraft: React.Dispatch<React.SetStateAction<ProductDraft>>,
  index: number,
  patch: Partial<{ group: string; label: string; value: string }>,
) {
  setDraft((current) => ({
    ...current,
    specSheet: current.specSheet.map((row, i) => (i === index ? { ...row, ...patch } : row)),
  }));
}

function Section({
  id,
  title,
  step,
  hint,
  children,
}: {
  id: string;
  title: string;
  step: number;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-lg border border-hairline bg-surface p-5 lg:p-6">
      <div className="mb-5">
        <h2 className="flex items-center gap-2.5 text-sm font-medium text-ink">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink/8 text-[10px] tabular text-muted">
            {step}
          </span>
          {title}
        </h2>
        {hint && <p className="ml-8 mt-1 text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Picks axis values and generates every combination. */
function VariantBuilder({
  axes,
  current,
  onGenerate,
}: {
  axes: AttributeOption[];
  current: VariantDraft[];
  onGenerate: (selection: Record<string, string[]>) => void;
}) {
  const [selection, setSelection] = React.useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const axis of axes) {
      const used = new Set(current.map((variant) => variant.attributes[axis.key]).filter(Boolean));
      if (used.size) initial[axis.key] = [...used];
    }
    return initial;
  });

  if (!axes.length) {
    return (
      <p className="rounded border border-hairline bg-canvas px-4 py-5 text-sm text-muted">
        No variant axes are configured.{' '}
        <a href="/admin/catalog/attributes" className="text-accent underline underline-offset-4">
          Create one under Attributes
        </a>{' '}
        — for example Storage for phones, or RAM for laptops.
      </p>
    );
  }

  const count = Object.values(selection).reduce((total, values) => total * (values.length || 1), 1);

  return (
    <div className="rounded border border-hairline bg-canvas p-4">
      <p className="mb-3 text-[13px] text-ink">Which options does this product come in?</p>
      <div className="space-y-4">
        {axes.map((axis) => (
          <div key={axis.id}>
            <p className="eyebrow mb-2">{axis.name}</p>
            <div className="flex flex-wrap gap-2">
              {axis.values.map((value) => {
                const active = selection[axis.key]?.includes(value.value);
                return (
                  <button
                    key={value.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setSelection((currentSelection) => {
                        const values = currentSelection[axis.key] ?? [];
                        const next = values.includes(value.value)
                          ? values.filter((v) => v !== value.value)
                          : [...values, value.value];
                        return { ...currentSelection, [axis.key]: next };
                      })
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-xs border px-2.5 py-1.5 text-xs transition-colors',
                      active ? 'border-accent bg-accent/10 text-accent' : 'border-hairline text-muted hover:border-ink/30',
                    )}
                  >
                    {value.hex && (
                      <span
                        className="h-3 w-3 rounded-full border border-black/10"
                        style={{ backgroundColor: value.hex }}
                        aria-hidden
                      />
                    )}
                    {value.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
        <Button size="sm" variant="secondary" onClick={() => onGenerate(selection)}>
          <Wand2 className="h-3.5 w-3.5" />
          Generate variants
        </Button>
        <span className="text-xs text-faint">
          {Object.values(selection).some((v) => v.length) ? `${count} combination${count === 1 ? '' : 's'}` : 'Select options above'}
        </span>
      </div>
    </div>
  );
}

function ImageEditor({
  images,
  onChange,
}: {
  images: { url: string; alt: string }[];
  onChange: (images: { url: string; alt: string }[]) => void;
}) {
  const [url, setUrl] = React.useState('');
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of Array.from(files)) form.append('files', file);
      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        body: form,
        headers: { 'x-aurum-csrf': document.cookie.match(/aurum_csrf=([^;]+)/)?.[1] ?? '' },
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error?.message ?? 'Upload failed');
      onChange([...images, ...payload.data.map((item: { url: string }) => ({ url: item.url, alt: '' }))]);
      toast.success('Uploaded');
    } catch (error) {
      toast.error("Couldn't upload", errorMessage(error));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      {images.length > 0 && (
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((image, index) => (
            <li key={index} className="group relative">
              <div className="product-ground relative aspect-square overflow-hidden rounded border border-hairline">
                {image.url && (
                  <Image src={image.url} alt={image.alt || 'Product image'} fill sizes="160px" className="object-contain p-2" />
                )}
                {index === 0 && (
                  <span className="absolute left-1.5 top-1.5">
                    <Badge tone="accent">Primary</Badge>
                  </span>
                )}
              </div>
              <Input
                value={image.alt}
                onChange={(event) =>
                  onChange(images.map((img, i) => (i === index ? { ...img, alt: event.target.value } : img)))
                }
                placeholder="Alt text"
                className="mt-1.5 h-8 text-xs"
                aria-label={`Alt text for image ${index + 1}`}
              />
              <button
                type="button"
                onClick={() => onChange(images.filter((_, i) => i !== index))}
                aria-label={`Remove image ${index + 1}`}
                className="absolute right-1.5 top-1.5 rounded-full bg-surface/90 p-1.5 text-faint opacity-0 backdrop-blur transition-opacity hover:text-critical group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Add by URL" className="min-w-[240px] flex-1">
          <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…  or  /products/…" />
        </Field>
        <Button
          variant="secondary"
          onClick={() => {
            if (!url.trim()) return;
            onChange([...images, { url: url.trim(), alt: '' }]);
            setUrl('');
          }}
        >
          Add
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          id="product-image-upload"
          onChange={(event) => upload(event.target.files)}
        />
        <Button variant="secondary" loading={uploading} onClick={() => inputRef.current?.click()}>
          Upload files
        </Button>
      </div>
      <p className="mt-2 text-xs text-faint">
        Uploads are stored by the configured storage driver (local disk by default, S3-compatible in production).
      </p>
    </div>
  );
}
