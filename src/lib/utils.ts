import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Stable, URL-safe slug. Handles accents and repeated separators. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || 'item';
  if (!(await exists(root))) return root;
  for (let i = 2; i < 200; i++) {
    const candidate = `${root}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

export function initials(first?: string | null, last?: string | null, email?: string | null) {
  const a = (first ?? '').trim()[0];
  const b = (last ?? '').trim()[0];
  if (a || b) return `${a ?? ''}${b ?? ''}`.toUpperCase();
  return (email ?? '?').trim()[0]?.toUpperCase() ?? '?';
}

export function formatDate(value: Date | string, opts?: Intl.DateTimeFormatOptions) {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  }).format(d);
}

export function formatDateTime(value: Date | string) {
  return formatDate(value, { hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(value: Date | string) {
  const d = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return formatDate(d);
}

/** YYYY-MM-DD in UTC — the key format used by daily aggregates. */
export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/** Groups an array by a derived key, preserving insertion order. */
export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    (out[k] ||= []).push(item);
  }
  return out;
}

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

/** Masks a phone number for storage/display: +250 78* *** 214 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.length < 6) return '***';
  return `${digits.slice(0, 5)}${'*'.repeat(Math.max(0, digits.length - 8))}${digits.slice(-3)}`;
}
