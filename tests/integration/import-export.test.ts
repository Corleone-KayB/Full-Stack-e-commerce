import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  commitProductImport,
  CSV_COLUMNS,
  exportProductsCsv,
  importTemplateCsv,
  parseCsv,
  planProductImport,
  toCsv,
} from '@/lib/services/import-export.service';
import { hasTestDb, pickVariant } from '../helpers/fixtures';

/**
 * Bulk price and stock changes over a spreadsheet — the thing a merchant does
 * on the morning a supplier sends a new price list. Two phases: a validation
 * pass that writes nothing and names every bad row, and a commit that runs in
 * one transaction so a bad file can never half-apply.
 */

const suite = hasTestDb ? describe : describe.skip;

function csv(rows: Record<string, string | number>[]) {
  const columns = ['sku', 'price', 'stock'];
  return [columns.join(','), ...rows.map((row) => columns.map((c) => row[c] ?? '').join(','))].join('\n');
}

describe('csv parsing', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields with commas, quotes and newlines inside them', () => {
    const input = 'sku,name\nA1,"Pro Max, 256 GB"\nA2,"He said ""hi"""\nA3,"line one\nline two"';
    expect(parseCsv(input)).toEqual([
      ['sku', 'name'],
      ['A1', 'Pro Max, 256 GB'],
      ['A2', 'He said "hi"'],
      ['A3', 'line one\nline two'],
    ]);
  });

  it('accepts CRLF from a Windows spreadsheet and skips blank lines', () => {
    expect(parseCsv('a,b\r\n1,2\r\n\r\n3,4\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('round-trips through toCsv without losing a delimiter', () => {
    const rows = [{ sku: 'A1', name: 'Pro Max, 256 GB "Silver"' }];
    const parsed = parseCsv(toCsv(rows, ['sku', 'name']));
    expect(parsed[1]).toEqual(['A1', 'Pro Max, 256 GB "Silver"']);
  });

  it('ships a template with every supported column', () => {
    const [header] = parseCsv(importTemplateCsv());
    expect(header).toEqual([...CSV_COLUMNS]);
  });
});

suite('export', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('writes one row per SKU with prices in major units', async () => {
    const output = await exportProductsCsv();
    const rows = parseCsv(output);
    const [header, ...body] = rows;

    expect(header).toEqual([...CSV_COLUMNS]);
    expect(body.length).toBe(await prisma.productVariant.count());

    const priceIndex = header.indexOf('price');
    for (const row of body.slice(0, 5)) {
      // A merchant sees 2,300.00 — not 230000 fils.
      expect(row[priceIndex]).toMatch(/^\d+(\.\d{1,2})?$/);
      expect(Number(row[priceIndex])).toBeLessThan(100_000);
    }
  });

  it('produces a file its own importer accepts unchanged', async () => {
    const plan = await planProductImport(await exportProductsCsv());
    expect(plan.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(plan.canCommit).toBe(true);
    // Re-importing what was just exported changes nothing.
    expect(plan.updates.filter((row) => row.action === 'update')).toEqual([]);
  });
});

suite('import — validation phase', () => {
  it('warns about a SKU the catalogue does not have, and leaves the row out', async () => {
    // A supplier list routinely contains lines the merchant does not stock.
    // That is a warning against that row, not a reason to reject the file.
    const plan = await planProductImport(csv([{ sku: 'NOT-A-REAL-SKU', price: '999' }]));

    expect(plan.issues[0]).toMatchObject({ row: 2, column: 'sku', severity: 'warning' });
    expect(plan.updates[0]).toMatchObject({ row: 2, sku: 'NOT-A-REAL-SKU', action: 'unknown', changes: [] });
    expect(plan.canCommit).toBe(true);
  });

  it('rejects a price cell that is not a positive number', async () => {
    const sku = (await pickVariant(1)).variant.sku;
    // Quoted, because a thousands separator inside an unquoted CSV cell is a
    // field break — the parser is right to split it, so the test must not.
    for (const bad of ['abc', '-5', '1.2.3', '"2,300.00.5"', 'free', '1e3']) {
      const plan = await planProductImport(`sku,price\n${sku},${bad}`);
      expect(plan.canCommit, `“${bad}” should have been rejected`).toBe(false);
      expect(plan.issues.some((i) => i.column === 'price')).toBe(true);
    }
  });

  it('accepts the shapes a spreadsheet actually produces', async () => {
    const sku = (await pickVariant(1)).variant.sku;
    for (const good of ['2300', '2300.00', '"2,300.00"', ' 2300 ', 'AED 2300']) {
      const plan = await planProductImport(`sku,price\n${sku},${good}`);
      expect(plan.canCommit, `“${good}” should have been accepted`).toBe(true);
      const row = plan.updates.find((r) => r.sku === sku)!;
      const change = row.changes.find((c) => c.field === 'price');
      if (change) expect(change.to).toBe('2300.00');
    }
  });

  it('rejects a stock cell that is not a whole number of units', async () => {
    const sku = (await pickVariant(1)).variant.sku;
    for (const bad of ['12.5', '-3', 'many', '1e3']) {
      const plan = await planProductImport(`sku,stock\n${sku},${bad}`);
      expect(plan.canCommit, `“${bad}” should have been rejected`).toBe(false);
      expect(plan.issues.some((i) => i.column === 'stock')).toBe(true);
    }
  });

  it('flags the same SKU appearing twice rather than letting the last row win', async () => {
    const sku = (await pickVariant(1)).variant.sku;
    const plan = await planProductImport(`sku,price\n${sku},1000\n${sku},2000`);
    expect(plan.canCommit).toBe(false);
    expect(plan.issues.some((i) => /more than once/i.test(i.message))).toBe(true);
  });

  it('rejects a missing sku column outright', async () => {
    const plan = await planProductImport('price,stock\n100,5');
    expect(plan.canCommit).toBe(false);
    expect(plan.issues.some((i) => /sku/i.test(i.message))).toBe(true);
  });

  it('shows the before and after of every field it would change', async () => {
    const inv = await pickVariant(1);
    const sku = inv.variant.sku;
    const newPrice = inv.variant.price / 100 + 100;

    const plan = await planProductImport(csv([{ sku, price: newPrice, stock: 42 }]));
    expect(plan.canCommit).toBe(true);

    const row = plan.updates.find((r) => r.sku === sku)!;
    expect(row.action).toBe('update');
    const fields = row.changes.map((c) => c.field);
    expect(fields).toContain('price');
    expect(fields).toContain('stock');
    const stockChange = row.changes.find((c) => c.field === 'stock')!;
    expect(stockChange.to).toBe('42');
  });

  it('marks a row that changes nothing as a skip', async () => {
    const inv = await pickVariant(1);
    const plan = await planProductImport(
      csv([{ sku: inv.variant.sku, price: inv.variant.price / 100, stock: inv.onHand }]),
    );
    expect(plan.updates.find((r) => r.sku === inv.variant.sku)?.action ?? 'skip').toBe('skip');
  });
});

suite('import — commit phase', () => {
  /** Movements are attributed to a real admin, so the ledger says who did it. */
  async function anAdmin() {
    const user = await prisma.user.findFirst({ where: { role: { key: 'SUPER_ADMIN' } } });
    if (!user) throw new Error('The seed has no super admin.');
    return user.id;
  }

  it('applies prices and stock, and records a stock movement', async () => {
    const inv = await pickVariant(1);
    const sku = inv.variant.sku;
    const variantId = inv.variantId;
    const movementsBefore = await prisma.inventoryMovement.count({ where: { variantId } });

    const result = await commitProductImport(csv([{ sku, price: '1234.50', stock: 77 }]), await anAdmin());

    expect(result.updatedVariants).toBe(1);
    const after = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { inventory: true },
    });
    expect(after!.price).toBe(123_450);
    expect(after!.inventory!.onHand).toBe(77);
    expect(await prisma.inventoryMovement.count({ where: { variantId } })).toBe(movementsBefore + 1);
  });

  it('refuses to commit a file with any error, leaving the good rows alone too', async () => {
    const [first, second] = await prisma.productVariant.findMany({ take: 2, orderBy: { sku: 'asc' } });
    const priceBefore = first.price;

    // One good row, one bad row. All-or-nothing means the good row must not land.
    const file = `sku,price\n${first.sku},1.00\n${second.sku},not-a-price`;
    await expect(commitProductImport(file, await anAdmin())).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const after = await prisma.productVariant.findUnique({ where: { id: first.id } });
    expect(after!.price).toBe(priceBefore);
  });

  it('never creates a product, a brand or a category from a spreadsheet', async () => {
    const before = {
      products: await prisma.product.count(),
      variants: await prisma.productVariant.count(),
      brands: await prisma.brand.count(),
      categories: await prisma.category.count(),
    };

    const result = await commitProductImport(
      `sku,product_name,brand,category,price\nGHOST-SKU,Ghost Phone,Ghostly,Phantoms,100`,
      await anAdmin(),
    );

    expect(result.updatedVariants).toBe(0);
    expect(result.skipped).toBe(1);
    expect({
      products: await prisma.product.count(),
      variants: await prisma.productVariant.count(),
      brands: await prisma.brand.count(),
      categories: await prisma.category.count(),
    }).toEqual(before);
  });
});
