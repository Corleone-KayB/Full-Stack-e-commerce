'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatMoney, type CurrencyMeta } from '@/lib/money';

/**
 * Charts.
 *
 * Hand-built SVG rather than a charting library: the whole set is four forms,
 * it keeps ~40 kB of JavaScript out of the admin bundle, and it inherits the
 * store's design tokens directly so light and dark are correct by definition.
 *
 * COLOUR DECISION
 * Every chart here is SINGLE-SERIES and drawn in the brand accent. Identity in
 * the part-to-whole views (payment mix, sales by series) is carried by a direct
 * text label on every bar, not by hue. That is deliberate: a multi-hue
 * categorical palette that passes colour-blind separation needs high-chroma
 * hues, which would fight the restrained palette this store is built on — and
 * a labelled bar is more readable than a legend anyway. It also means the
 * charts stay legible in greyscale, in forced-colours mode, and printed.
 *
 * Every chart also ships a table view, so the numbers are always reachable
 * without reading a picture.
 */

const ACCENT = 'rgb(var(--accent))';

/**
 * How a value is written out.
 *
 * A plain object rather than a formatter function, because these charts are
 * client components rendered from server pages — and a function cannot cross
 * that boundary. The descriptor can.
 */
export interface ValueFormat {
  kind: 'money' | 'count';
  currency?: CurrencyMeta;
  /** Singular noun for counts: "order" → "3 orders". */
  noun?: string;
}

function present(value: number, format: ValueFormat): string {
  if (format.kind === 'money') return formatMoney(value, format.currency);
  const noun = format.noun;
  return noun ? `${value} ${noun}${value === 1 ? '' : 's'}` : String(value);
}

function useChartId(prefix: string) {
  const id = React.useId().replace(/:/g, '');
  return `${prefix}-${id}`;
}

/**
 * Axis tick.
 *
 * Money is stored in minor units, so a tick must be divided down before it is
 * shown — otherwise an axis reads "1.0M" for ten thousand dirhams.
 */
function formatTick(value: number, format: ValueFormat) {
  const scaled = format.kind === 'money' ? value / 10 ** (format.currency?.precision ?? 2) : value;
  if (Math.abs(scaled) >= 1_000_000) return `${(scaled / 1_000_000).toFixed(1)}M`;
  if (Math.abs(scaled) >= 1_000) return `${Math.round(scaled / 1000)}k`;
  return String(Math.round(scaled));
}

/** Nice round upper bound so gridlines land on readable numbers. */
function niceMax(value: number): number {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

// ---------------------------------------------------------------------------
// Area / line — change over time
// ---------------------------------------------------------------------------

export interface SeriesPoint {
  label: string;
  value: number;
  /** Secondary figure shown in the tooltip only. */
  meta?: string;
}

export function AreaChart({
  data,
  height = 220,
  format,
  ariaLabel,
  className,
}: {
  data: SeriesPoint[];
  height?: number;
  format: ValueFormat;
  ariaLabel: string;
  className?: string;
}) {
  const gradientId = useChartId('grad');
  const [hover, setHover] = React.useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const width = 720;
  const padding = { top: 14, right: 8, bottom: 26, left: 46 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const stepX = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth;

  const x = (index: number) => padding.left + index * stepX;
  const y = (value: number) => padding.top + plotHeight - (value / max) * plotHeight;

  const linePath = data.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point.value)}`).join(' ');
  const areaPath = `${linePath} L ${x(data.length - 1)} ${padding.top + plotHeight} L ${x(0)} ${padding.top + plotHeight} Z`;

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((fraction) => max * fraction);
  // Only every nth label, so the axis never collides at narrow widths.
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relative = ((event.clientX - rect.left) / rect.width) * width;
    const index = Math.round((relative - padding.left) / stepX);
    setHover(index >= 0 && index < data.length ? index : null);
  }

  const active = hover !== null ? data[hover] : null;

  return (
    <figure className={cn('relative', className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full touch-none"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.22" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(value)}
              y2={y(value)}
              stroke="rgb(var(--hairline))"
              strokeWidth="1"
            />
            <text
              x={padding.left - 8}
              y={y(value) + 3.5}
              textAnchor="end"
              className="fill-[rgb(var(--faint))] text-[10px] tabular"
            >
              {formatTick(value, format)}
            </text>
          </g>
        ))}

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {data.map((point, index) =>
          index % labelEvery === 0 || index === data.length - 1 ? (
            <text
              key={point.label}
              x={x(index)}
              y={height - 8}
              textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'}
              className="fill-[rgb(var(--faint))] text-[10px]"
            >
              {point.label}
            </text>
          ) : null,
        )}

        {hover !== null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={padding.top}
              y2={padding.top + plotHeight}
              stroke="rgb(var(--faint))"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {/* 2px surface ring keeps the marker readable over the line. */}
            <circle cx={x(hover)} cy={y(data[hover].value)} r="6" fill="rgb(var(--surface))" />
            <circle cx={x(hover)} cy={y(data[hover].value)} r="4" fill={ACCENT} />
          </g>
        )}
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute top-2 rounded border border-hairline bg-elevated px-2.5 py-1.5 shadow-lifted"
          style={{
            left: `${Math.min(88, Math.max(2, ((x(hover!) - padding.left) / plotWidth) * 100))}%`,
          }}
        >
          <p className="text-2xs text-muted">{active.label}</p>
          <p className="text-sm tabular font-medium text-ink">{present(active.value, format)}</p>
          {active.meta && <p className="text-2xs text-faint">{active.meta}</p>}
        </div>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Column chart — counts over time
// ---------------------------------------------------------------------------

export function ColumnChart({
  data,
  height = 160,
  format,
  ariaLabel,
  className,
}: {
  data: SeriesPoint[];
  height?: number;
  format: ValueFormat;
  ariaLabel: string;
  className?: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const width = 720;
  const padding = { top: 12, right: 4, bottom: 24, left: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const slot = plotWidth / data.length;
  // 2px gap between adjacent bars, thin marks.
  const barWidth = Math.max(2, Math.min(14, slot - 2));
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <figure className={cn('relative', className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + plotHeight}
          y2={padding.top + plotHeight}
          stroke="rgb(var(--hairline))"
        />
        <text x={padding.left - 8} y={padding.top + 4} textAnchor="end" className="fill-[rgb(var(--faint))] text-[10px] tabular">
          {formatTick(max, format)}
        </text>

        {data.map((point, index) => {
          const barHeight = (point.value / max) * plotHeight;
          const cx = padding.left + index * slot + slot / 2;
          return (
            <g key={point.label} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)}>
              {/* Hit target is the whole column, not just the drawn bar. */}
              <rect x={cx - slot / 2} y={padding.top} width={slot} height={plotHeight} fill="transparent" />
              <rect
                x={cx - barWidth / 2}
                y={padding.top + plotHeight - barHeight}
                width={barWidth}
                height={Math.max(barHeight, point.value > 0 ? 2 : 0)}
                rx="2"
                fill={ACCENT}
                opacity={hover === null || hover === index ? 0.9 : 0.4}
              />
              {index % labelEvery === 0 && (
                <text x={cx} y={height - 7} textAnchor="middle" className="fill-[rgb(var(--faint))] text-[10px]">
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded border border-hairline bg-elevated px-2.5 py-1.5 shadow-lifted"
          style={{ left: `${Math.min(86, (hover / data.length) * 100)}%` }}
        >
          <p className="text-2xs text-muted">{data[hover].label}</p>
          <p className="text-sm tabular font-medium text-ink">{present(data[hover].value, format)}</p>
        </div>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Labelled horizontal bars — part-to-whole without a colour legend
// ---------------------------------------------------------------------------

export interface LabelledBar {
  label: string;
  value: number;
  /** Right-hand figure, already formatted. */
  display: string;
  sublabel?: string;
}

export function BarList({
  data,
  ariaLabel,
  className,
  emptyMessage = 'No data yet.',
}: {
  data: LabelledBar[];
  ariaLabel: string;
  className?: string;
  emptyMessage?: string;
}) {
  if (!data.length) {
    return <p className={cn('py-8 text-center text-sm text-muted', className)}>{emptyMessage}</p>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className={cn('space-y-3', className)} aria-label={ariaLabel}>
      {data.map((row) => (
        <li key={row.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-4">
            <span className="min-w-0 truncate text-[13px] text-ink">
              {row.label}
              {row.sublabel && <span className="ml-2 text-2xs text-faint">{row.sublabel}</span>}
            </span>
            <span className="shrink-0 text-[13px] tabular text-muted">{row.display}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-hairline">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500 ease-premium"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Stat tile & sparkline
// ---------------------------------------------------------------------------

export function StatTile({
  label,
  value,
  delta,
  hint,
  spark,
  className,
}: {
  label: string;
  value: string;
  /** Percentage change against the previous comparable period. */
  delta?: number | null;
  hint?: string;
  spark?: number[];
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-hairline bg-surface p-5', className)}>
      <p className="eyebrow mb-2">{label}</p>
      <div className="flex items-end justify-between gap-3">
        {/* Long currency strings shrink rather than wrapping onto two lines. */}
        <p
          className={cn(
            'font-medium tabular tracking-tight text-ink',
            value.length > 14 ? 'text-lg' : value.length > 11 ? 'text-xl' : 'text-2xl',
          )}
        >
          {value}
        </p>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {typeof delta === 'number' && (
          <span
            className={cn(
              'text-xs tabular font-medium',
              delta > 0 ? 'text-positive' : delta < 0 ? 'text-critical' : 'text-muted',
            )}
          >
            {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-xs text-faint">{hint}</span>}
      </div>
    </div>
  );
}

export function Sparkline({ values, width = 72, height = 24 }: { values: number[]; width?: number; height?: number }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const path = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${index * step} ${height - ((value - min) / range) * height}`)
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0 overflow-visible">
      <path d={path} fill="none" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

/**
 * Table view.
 *
 * Every chart on a page is paired with one of these behind a disclosure, so a
 * screen-reader user — or anyone who wants the exact figures — never has to
 * infer a number from a picture.
 */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-2xs uppercase tracking-[0.1em] text-faint underline-offset-4 hover:text-muted hover:underline"
      >
        {open ? 'Hide' : 'Show'} data table
      </button>
      {open && (
        <div className="mt-3 max-h-64 overflow-auto rounded border border-hairline">
          <table className="w-full text-left text-[13px]">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 bg-surface">
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col" className="border-b border-hairline px-3 py-2 font-medium text-muted">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-hairline last:border-0">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={cn('px-3 py-1.5 text-ink', cellIndex > 0 && 'tabular')}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
