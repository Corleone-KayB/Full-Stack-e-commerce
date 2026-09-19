import { prisma } from '../db';
import { AppError } from '../errors';
import { toMinor, toMajor } from '../money';
import { slugify } from '../utils';

/**
 * CSV import / export.
 *
 * The import is two-phase on purpose: `validate` reports every problem with a
 * row number and changes nothing, and `commit` only runs when the merchant has
 * seen that report. A single bad row never leaves the catalogue half-updated —
 * the commit runs in one transaction.
 *
 * The file is keyed on SKU, which is the only identifier a merchant reliably
 * has in a spreadsheet.
 */

export const CSV_COLUMNS = [
  'sku',
  'product_name',
  'variant_name',
  'brand',
  'category',
  'series',
  'condition',
  'price',
  'compare_at_price',
  'stock',
  'low_stock_threshold',
  'storage',
  'color',
  'active',
  'featured',
  'bestseller',
  'short_description',
  'warranty_months',
  'image_url',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** RFC-4180-ish parser: handles quoted fields, embedded commas and newlines. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[], columns: readonly string[]): string {
  const header = columns.join(',');
  const body = rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(','));
  return [header, ...body].join('\n');
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportProductsCsv(): Promise<string> {
  const variants = await prisma.productVariant.findMany({
    orderBy: [{ product: { name: 'asc' } }, { position: 'asc' }],
    include: {
      inventory: true,
      attributes: { include: { attribute: true, value: true } },
      product: {
        include: {
          brand: { select: { name: true } },
          category: { select: { name: true } },
          series: { select: { name: true } },
          images: { orderBy: { position: 'asc' }, take: 1 },
        },
      },
    },
  });

  const rows = variants.map((variant) => {
    const attributes = Object.fromEntries(
      variant.attributes.map((link) => [link.attribute.key, link.value.label]),
    );
    return {
      sku: variant.sku,
      product_name: variant.product.name,
      variant_name: variant.name,
      brand: variant.product.brand.name,
      category: variant.product.category.name,
      series: variant.product.series?.name ?? '',
      condition: variant.product.condition,
      price: toMajor(variant.price).toFixed(2),
      compare_at_price: variant.compareAtPrice ? toMajor(variant.compareAtPrice).toFixed(2) : '',
      stock: variant.inventory?.onHand ?? 0,
      low_stock_threshold: variant.inventory?.lowStockThreshold ?? 3,
      storage: attributes.storage ?? '',
      color: attributes.color ?? '',
      active: variant.active && variant.product.active ? 'yes' : 'no',
      featured: variant.product.featured ? 'yes' : 'no',
      bestseller: variant.product.bestseller ? 'yes' : 'no',
      short_description: variant.product.shortDescription ?? '',
      warranty_months: variant.product.warrantyMonths,
      image_url: variant.imageUrl ?? variant.product.images[0]?.url ?? '',
    };
  });

  return toCsv(rows, CSV_COLUMNS);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportIssue {
  row: number;
  column?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ImportPlanRow {
  row: number;
  sku: string;
  action: 'update' | 'skip' | 'unknown';
  productName: string;
  changes: { field: string; from: string; to: string }[];
}

export interface ImportPlan {
  columns: string[];
  totalRows: number;
  updates: ImportPlanRow[];
  issues: ImportIssue[];
  canCommit: boolean;
}

const boolish = (value: string) => ['yes', 'true', '1', 'y'].includes(value.trim().toLowerCase());

/**
 * Reads a money cell strictly.
 *
 * Stripping non-numeric characters and calling Number() is not good enough
 * here: it turns "abc" into "" into 0 — a free product — and "-5" into 5.
 * Currency symbols, thousands separators and surrounding spaces are tolerated
 * because that is what spreadsheets produce; anything else is a rejection.
 */
function readMoneyCell(raw: string): number | null {
  const cleaned = raw.trim().replace(/[\s,]/g, '').replace(/^(AED|USD|RWF|\$)/i, '');
  if (!/^\d+(\.\d{1,4})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Reads a whole-number cell strictly. "12.5", "-3" and "many" are all rejected. */
function readCountCell(raw: string): number | null {
  const cleaned = raw.trim().replace(/[\s,]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Builds a change plan without touching the database.
 *
 * Deliberately limited to updating existing SKUs (price, stock, flags,
 * descriptions). Creating whole products from a flat file silently invents
 * taxonomy rows, so that is left to the product editor where the merchant can
 * see what they are creating.
 */
export async function planProductImport(csv: string): Promise<ImportPlan> {
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    return {
      columns: [],
      totalRows: 0,
      updates: [],
      issues: [{ row: 0, message: 'The file has no data rows.', severity: 'error' }],
      canCommit: false,
    };
  }

  const header = rows[0].map((cell) => cell.trim().toLowerCase().replace(/\s+/g, '_'));
  const issues: ImportIssue[] = [];

  if (!header.includes('sku')) {
    issues.push({ row: 1, column: 'sku', message: 'A “sku” column is required.', severity: 'error' });
    return { columns: header, totalRows: rows.length - 1, updates: [], issues, canCommit: false };
  }

  const unknownColumns = header.filter((column) => !CSV_COLUMNS.includes(column as CsvColumn));
  for (const column of unknownColumns) {
    issues.push({ row: 1, column, message: `Column “${column}” is not recognised and will be ignored.`, severity: 'warning' });
  }

  const dataRows = rows.slice(1);
  const skus = dataRows.map((row) => (row[header.indexOf('sku')] ?? '').trim()).filter(Boolean);

  const existing = await prisma.productVariant.findMany({
    where: { sku: { in: skus } },
    include: { inventory: true, product: true },
  });
  const bySku = new Map(existing.map((variant) => [variant.sku, variant]));

  const seen = new Set<string>();
  const updates: ImportPlanRow[] = [];

  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2; // 1-based, plus the header
    const get = (column: CsvColumn) => {
      const position = header.indexOf(column);
      return position === -1 ? undefined : (cells[position] ?? '').trim();
    };

    const sku = get('sku') ?? '';
    if (!sku) {
      issues.push({ row: rowNumber, column: 'sku', message: 'Missing SKU.', severity: 'error' });
      return;
    }
    if (seen.has(sku)) {
      issues.push({ row: rowNumber, column: 'sku', message: `SKU ${sku} appears more than once.`, severity: 'error' });
      return;
    }
    seen.add(sku);

    const variant = bySku.get(sku);
    if (!variant) {
      issues.push({
        row: rowNumber,
        column: 'sku',
        message: `No product has SKU ${sku}. Create it in the product editor first — this importer updates, it does not create.`,
        severity: 'warning',
      });
      updates.push({ row: rowNumber, sku, action: 'unknown', productName: get('product_name') ?? '—', changes: [] });
      return;
    }

    const changes: ImportPlanRow['changes'] = [];

    const price = get('price');
    if (price) {
      const parsed = readMoneyCell(price);
      if (parsed === null) {
        issues.push({
          row: rowNumber,
          column: 'price',
          message: `“${price}” is not a valid price. Use a positive number such as 2300 or 2300.00.`,
          severity: 'error',
        });
      } else if (toMinor(parsed) !== variant.price) {
        changes.push({ field: 'price', from: toMajor(variant.price).toFixed(2), to: parsed.toFixed(2) });
      }
    }

    const compareAt = get('compare_at_price');
    if (compareAt !== undefined && compareAt !== '') {
      const parsed = readMoneyCell(compareAt);
      if (parsed === null) {
        issues.push({
          row: rowNumber,
          column: 'compare_at_price',
          message: `“${compareAt}” is not a valid price.`,
          severity: 'error',
        });
      } else if (toMinor(parsed) !== (variant.compareAtPrice ?? 0)) {
        changes.push({
          field: 'compareAtPrice',
          from: variant.compareAtPrice ? toMajor(variant.compareAtPrice).toFixed(2) : '—',
          to: parsed.toFixed(2),
        });
      }
    }

    const stock = get('stock');
    if (stock) {
      const parsed = readCountCell(stock);
      if (parsed === null) {
        issues.push({
          row: rowNumber,
          column: 'stock',
          message: `“${stock}” is not a whole number of units.`,
          severity: 'error',
        });
      } else if (parsed !== (variant.inventory?.onHand ?? 0)) {
        changes.push({ field: 'stock', from: String(variant.inventory?.onHand ?? 0), to: String(parsed) });
      }
    }

    const active = get('active');
    if (active) {
      const next = boolish(active);
      if (next !== variant.active) changes.push({ field: 'active', from: String(variant.active), to: String(next) });
    }

    for (const [column, field, current] of [
      ['featured', 'featured', variant.product.featured],
      ['bestseller', 'bestseller', variant.product.bestseller],
    ] as const) {
      const raw = get(column);
      if (raw) {
        const next = boolish(raw);
        if (next !== current) changes.push({ field, from: String(current), to: String(next) });
      }
    }

    const description = get('short_description');
    if (description && description !== (variant.product.shortDescription ?? '')) {
      changes.push({ field: 'shortDescription', from: variant.product.shortDescription ?? '—', to: description });
    }

    updates.push({
      row: rowNumber,
      sku,
      action: changes.length ? 'update' : 'skip',
      productName: variant.product.name,
      changes,
    });
  });

  return {
    columns: header,
    totalRows: dataRows.length,
    updates,
    issues,
    canCommit: !issues.some((issue) => issue.severity === 'error'),
  };
}

export interface ImportResult {
  updatedVariants: number;
  updatedProducts: number;
  stockMovements: number;
  skipped: number;
}

/** Applies a validated plan. Rejects outright if the plan has any error. */
export async function commitProductImport(csv: string, userId: string): Promise<ImportResult> {
  const plan = await planProductImport(csv);
  if (!plan.canCommit) {
    throw new AppError('VALIDATION_ERROR', 'The file still has errors. Fix them and re-validate.', {
      details: { issues: plan.issues.filter((i) => i.severity === 'error') },
    });
  }

  const rows = parseCsv(csv);
  const header = rows[0].map((cell) => cell.trim().toLowerCase().replace(/\s+/g, '_'));
  const index = (column: CsvColumn) => header.indexOf(column);

  const result: ImportResult = { updatedVariants: 0, updatedProducts: 0, stockMovements: 0, skipped: 0 };
  const touchedProducts = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const planRow of plan.updates) {
      if (planRow.action !== 'update') {
        result.skipped += 1;
        continue;
      }

      const cells = rows[planRow.row - 1];
      const get = (column: CsvColumn) => {
        const position = index(column);
        return position === -1 ? undefined : (cells[position] ?? '').trim();
      };

      const variant = await tx.productVariant.findUnique({
        where: { sku: planRow.sku },
        include: { inventory: true },
      });
      if (!variant) continue;

      // Cells are read with the same strict parsers the plan used, so the
      // commit cannot interpret a value differently from the preview the
      // merchant approved.
      const variantData: Record<string, unknown> = {};
      const price = readMoneyCell(get('price') ?? '');
      if (price !== null) variantData.price = toMinor(price);
      const compareAt = readMoneyCell(get('compare_at_price') ?? '');
      if (compareAt !== null) variantData.compareAtPrice = toMinor(compareAt);
      const active = get('active');
      if (active) variantData.active = boolish(active);

      if (Object.keys(variantData).length) {
        await tx.productVariant.update({ where: { id: variant.id }, data: variantData });
        result.updatedVariants += 1;
      }

      const next = readCountCell(get('stock') ?? '');
      if (next !== null && variant.inventory) {
        const threshold = readCountCell(get('low_stock_threshold') ?? '');
        if (next !== variant.inventory.onHand) {
          await tx.inventory.update({
            where: { variantId: variant.id },
            data: {
              onHand: next,
              ...(threshold !== null ? { lowStockThreshold: threshold } : {}),
            },
          });
          await tx.inventoryMovement.create({
            data: {
              variantId: variant.id,
              type: 'SET',
              quantity: next - variant.inventory.onHand,
              reason: 'CSV import',
              referenceType: 'import',
              resultingOnHand: next,
              resultingReserved: variant.inventory.reserved,
              userId,
            },
          });
          result.stockMovements += 1;
        }
      }

      const productData: Record<string, unknown> = {};
      const featured = get('featured');
      if (featured) productData.featured = boolish(featured);
      const bestseller = get('bestseller');
      if (bestseller) productData.bestseller = boolish(bestseller);
      const description = get('short_description');
      if (description) productData.shortDescription = description;
      const warranty = get('warranty_months');
      if (warranty && Number.isInteger(Number(warranty))) productData.warrantyMonths = Number(warranty);

      if (Object.keys(productData).length && !touchedProducts.has(variant.productId)) {
        await tx.product.update({ where: { id: variant.productId }, data: productData });
        touchedProducts.add(variant.productId);
        result.updatedProducts += 1;
      }
    }
  });

  return result;
}

/** Blank template with the expected header and one worked example row. */
export function importTemplateCsv(): string {
  return toCsv(
    [
      {
        sku: 'AUR-IP15PRO-256GB-NAT',
        product_name: 'iPhone 15 Pro',
        variant_name: '256 GB · Natural Titanium',
        brand: 'Apple',
        category: 'Smartphones',
        series: 'iPhone 15',
        condition: 'REFURBISHED_EXCELLENT',
        price: '1990.00',
        compare_at_price: '',
        stock: '6',
        low_stock_threshold: '3',
        storage: '256 GB',
        color: 'Natural Titanium',
        active: 'yes',
        featured: 'yes',
        bestseller: 'no',
        short_description: 'Titanium, the Action button and USB-C 3.',
        warranty_months: '12',
        image_url: '',
      },
    ],
    CSV_COLUMNS,
  );
}

export { slugify };
