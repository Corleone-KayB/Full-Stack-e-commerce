'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, X, CornerDownLeft } from 'lucide-react';
import { apiGet } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/components/providers';
import { useFocusTrap, useLockBody, Skeleton } from '@/components/ui';
import type { SearchSuggestion } from '@/lib/services/catalog.service';

/**
 * Search.
 *
 * Debounced, cancellable suggestions with thumbnails. Arrow keys move through
 * results and Enter opens the highlighted one — Enter on nothing highlighted
 * runs a full search, so the dialog is usable entirely from the keyboard.
 */

const RECENT_KEY = 'aurum:recent-searches';

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { format } = useCurrency();
  const [term, setTerm] = React.useState('');
  const [results, setResults] = React.useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [highlight, setHighlight] = React.useState(-1);
  const [recent, setRecent] = React.useState<string[]>([]);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  useLockBody(open);
  useFocusTrap(open, panelRef, onClose);

  React.useEffect(() => {
    if (!open) return;
    setTerm('');
    setResults([]);
    setHighlight(-1);
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]').slice(0, 5));
    } catch {
      setRecent([]);
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(timer);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const query = term.trim();
    if (query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await apiGet<SearchSuggestion[]>(
          `/api/search?q=${encodeURIComponent(query)}&limit=6`,
          controller.signal,
        );
        setResults(data);
        setHighlight(-1);
      } catch {
        // Aborted or failed — leave the previous results in place.
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term, open]);

  const remember = React.useCallback((query: string) => {
    try {
      const next = [query, ...JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')]
        .filter((v, i, arr) => v && arr.indexOf(v) === i)
        .slice(0, 5);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // Private browsing — recent searches are a convenience, not a feature.
    }
  }, []);

  const go = React.useCallback(
    (href: string, query?: string) => {
      if (query) remember(query);
      onClose();
      router.push(href);
    },
    [onClose, router, remember],
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = results[highlight];
      if (chosen) go(chosen.href, term);
      else if (term.trim()) go(`/shop?q=${encodeURIComponent(term.trim())}`, term.trim());
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-0 sm:p-6 sm:pt-[12vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px] animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search products"
        className="relative flex h-full w-full flex-col border-hairline bg-elevated shadow-floating
                   sm:h-auto sm:max-h-[70vh] sm:max-w-2xl sm:rounded-xl sm:border animate-scale-in"
      >
        <div className="flex items-center gap-3 border-b border-hairline px-5 py-4">
          <Search className="h-4.5 w-4.5 shrink-0 text-faint" aria-hidden />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Try “iPhone 13 128” or “Pro Max”"
            className="w-full bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
            aria-autocomplete="list"
            aria-controls="search-results"
            autoComplete="off"
          />
          <button type="button" onClick={onClose} aria-label="Close search" className="rounded p-1 text-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div id="search-results" className="flex-1 overflow-y-auto p-2" role="listbox">
          {loading && results.length === 0 && (
            <div className="space-y-2 p-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="h-12 w-12 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-2.5 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && term.trim().length >= 2 && results.length === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-ink">No matches for “{term.trim()}”</p>
              <p className="mt-1 text-xs text-muted">Try a model name, a storage size, or a SKU.</p>
              <Link
                href="/shop"
                onClick={onClose}
                className="mt-4 inline-block text-xs font-medium text-accent underline underline-offset-4"
              >
                Browse everything
              </Link>
            </div>
          )}

          {results.map((result, index) => (
            <button
              key={`${result.type}-${result.href}`}
              type="button"
              role="option"
              aria-selected={highlight === index}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => go(result.href, term)}
              className={cn(
                'flex w-full items-center gap-3 rounded px-2 py-2 text-left transition-colors',
                highlight === index ? 'bg-ink/6' : 'hover:bg-ink/5',
              )}
            >
              <span className="product-ground flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-hairline">
                {result.imageUrl ? (
                  <Image src={result.imageUrl} alt="" width={48} height={48} className="h-full w-full object-contain p-1" />
                ) : (
                  <Search className="h-4 w-4 text-faint" aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{result.label}</span>
                {result.sublabel && <span className="block truncate text-xs text-faint">{result.sublabel}</span>}
              </span>
              {typeof result.price === 'number' && (
                <span className="shrink-0 text-sm tabular text-muted">{format(result.price)}</span>
              )}
            </button>
          ))}

          {term.trim().length < 2 && recent.length > 0 && (
            <div className="p-2">
              <p className="eyebrow px-2 pb-2">Recent</p>
              {recent.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setTerm(entry)}
                  className="block w-full rounded px-2 py-2 text-left text-sm text-muted hover:bg-ink/5 hover:text-ink"
                >
                  {entry}
                </button>
              ))}
            </div>
          )}

          {term.trim().length < 2 && recent.length === 0 && (
            <div className="p-2">
              <p className="eyebrow px-2 pb-2">Popular</p>
              {['iPhone 15 Pro', 'iPhone 13 128GB', 'Pro Max', 'iPhone 16'].map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setTerm(entry)}
                  className="block w-full rounded px-2 py-2 text-left text-sm text-muted hover:bg-ink/5 hover:text-ink"
                >
                  {entry}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-hairline px-5 py-2.5 text-2xs text-faint sm:flex">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-xs border border-hairline px-1">↑</kbd>
            <kbd className="rounded-xs border border-hairline px-1">↓</kbd> to navigate
          </span>
          <span className="flex items-center gap-1.5">
            <CornerDownLeft className="h-3 w-3" /> to open
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-xs border border-hairline px-1">esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
