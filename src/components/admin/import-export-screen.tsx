'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Download, FileUp, Info } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import { Badge, Button } from '@/components/ui';

/**
 * CSV import / export.
 *
 * Two phases, always. "Validate" reports every problem with a row number and
 * writes nothing; "Apply" only becomes available once the file is clean, and
 * runs in a single transaction. A merchant can therefore paste in a supplier
 * price list and see exactly what it would do before it does it.
 */

interface ImportIssue {
  row: number;
  column?: string;
  message: string;
  severity: 'error' | 'warning';
}

interface ImportPlanRow {
  row: number;
  sku: string;
  action: 'update' | 'skip' | 'unknown';
  productName: string;
  changes: { field: string; from: string; to: string }[];
}

interface ImportPlan {
  columns: string[];
  totalRows: number;
  updates: ImportPlanRow[];
  issues: ImportIssue[];
  canCommit: boolean;
}

export function ImportExportScreen({
  productCount,
  variantCount,
  columns,
}: {
  productCount: number;
  variantCount: number;
  columns: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [csv, setCsv] = React.useState('');
  const [filename, setFilename] = React.useState('');
  const [plan, setPlan] = React.useState<ImportPlan | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function readFile(file: File) {
    const text = await file.text();
    setCsv(text);
    setFilename(file.name);
    setPlan(null);
  }

  async function validate() {
    setBusy(true);
    try {
      const result = await apiPost<ImportPlan>('/api/admin/import', { csv, mode: 'validate' });
      setPlan(result);
      if (result.canCommit) {
        const changing = result.updates.filter((row) => row.action === 'update').length;
        toast.success('File checked', `${changing} row${changing === 1 ? '' : 's'} would change.`);
      } else {
        toast.error('The file has errors', 'Fix them and check again — nothing has been written.');
      }
    } catch (error) {
      toast.error("Couldn't read the file", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    try {
      const result = await apiPost<{
        updatedVariants: number;
        updatedProducts: number;
        stockMovements: number;
        skipped: number;
      }>('/api/admin/import', { csv, mode: 'commit' });
      toast.success(
        'Import applied',
        `${result.updatedVariants} SKU${result.updatedVariants === 1 ? '' : 's'} and ${result.updatedProducts} product${
          result.updatedProducts === 1 ? '' : 's'
        } updated.`,
      );
      setPlan(null);
      setCsv('');
      setFilename('');
      router.refresh();
    } catch (error) {
      toast.error('Import failed', errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const errors = plan?.issues.filter((issue) => issue.severity === 'error') ?? [];
  const warnings = plan?.issues.filter((issue) => issue.severity === 'warning') ?? [];
  const changing = plan?.updates.filter((row) => row.action === 'update') ?? [];

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="text-sm font-medium text-ink">Export</h2>
        <p className="mt-1.5 text-[13px] text-muted">
          {variantCount} SKUs across {productCount} products, one row per SKU.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href="/api/admin/export?type=products"
            className="inline-flex h-10 items-center gap-2 rounded bg-ink px-4 text-[13px] font-medium text-canvas"
          >
            <Download className="h-3.5 w-3.5" />
            Export catalogue
          </a>
          <a
            href="/api/admin/export?type=template"
            className="inline-flex h-10 items-center gap-2 rounded border border-hairline px-4 text-[13px] text-muted transition-colors hover:border-accent hover:text-accent"
          >
            Download a blank template
          </a>
        </div>
      </section>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="text-sm font-medium text-ink">Import</h2>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
          Keyed on <span className="font-mono text-xs">sku</span>. The importer updates existing SKUs — price,
          compare-at price, stock, low-stock threshold, active, featured, best seller and the short description. It does
          not create products: that would silently invent categories and brands, so new products are added in the
          editor where you can see what you are creating.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            id="csv-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-3.5 w-3.5" />
            Choose a CSV
          </Button>
          {filename && <span className="text-[13px] text-muted">{filename}</span>}
          {csv && (
            <Button onClick={validate} loading={busy} loadingLabel="Checking…">
              Check the file
            </Button>
          )}
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-2xs uppercase tracking-[0.1em] text-faint">Expected columns</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {columns.map((column) => (
              <span key={column} className="rounded-xs border border-hairline px-1.5 py-0.5 font-mono text-[10px] text-muted">
                {column}
              </span>
            ))}
          </div>
        </details>
      </section>

      {plan && (
        <section className="rounded-lg border border-hairline bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-ink">Preview</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="outline">{plan.totalRows} rows read</Badge>
              <Badge tone={changing.length ? 'accent' : 'neutral'}>{changing.length} would change</Badge>
              {errors.length > 0 && <Badge tone="critical">{errors.length} errors</Badge>}
              {warnings.length > 0 && <Badge tone="caution">{warnings.length} warnings</Badge>}
            </div>
          </div>

          {plan.issues.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {plan.issues.slice(0, 30).map((issue, index) => (
                <li
                  key={index}
                  className={`flex items-start gap-2 rounded px-3 py-2 text-[13px] ${
                    issue.severity === 'error' ? 'bg-critical/8 text-critical' : 'bg-caution/8 text-caution'
                  }`}
                >
                  {issue.severity === 'error' ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>
                    <span className="font-medium">Row {issue.row}</span>
                    {issue.column ? ` · ${issue.column}` : ''} — {issue.message}
                  </span>
                </li>
              ))}
              {plan.issues.length > 30 && (
                <li className="px-3 text-xs text-faint">…and {plan.issues.length - 30} more.</li>
              )}
            </ul>
          )}

          {changing.length > 0 && (
            <div className="mt-5 max-h-80 overflow-auto rounded border border-hairline">
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-hairline text-2xs uppercase tracking-[0.08em] text-faint">
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {changing.map((row) => (
                    <tr key={row.row} className="border-b border-hairline last:border-0">
                      <td className="px-3 py-2 tabular text-muted">{row.row}</td>
                      <td className="px-3 py-2">
                        <span className="block font-mono text-xs">{row.sku}</span>
                        <span className="block text-xs text-muted">{row.productName}</span>
                      </td>
                      <td className="px-3 py-2">
                        <ul className="space-y-0.5">
                          {row.changes.map((change, index) => (
                            <li key={index} className="text-xs">
                              <span className="text-muted">{change.field}:</span>{' '}
                              <span className="text-faint line-through">{change.from}</span>{' '}
                              <span className="text-ink">→ {change.to}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
            <Button onClick={commit} loading={busy} disabled={!plan.canCommit || changing.length === 0}>
              <CheckCircle2 className="h-4 w-4" />
              Apply {changing.length} change{changing.length === 1 ? '' : 's'}
            </Button>
            <Button variant="secondary" onClick={() => setPlan(null)}>
              Discard
            </Button>
            {!plan.canCommit && <span className="text-xs text-critical">Fix the errors above first.</span>}
          </div>
        </section>
      )}
    </div>
  );
}
