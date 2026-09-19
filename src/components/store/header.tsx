'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Heart, Menu, Moon, Search, ShoppingBag, Sun, User, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCart, useCurrency, useWishlist } from '@/components/providers';
import { Drawer } from '@/components/ui';
import { SearchDialog } from './search-dialog';
import type { NavCategory, NavSeries } from '@/lib/server-context';

/**
 * Storefront header.
 *
 * Desktop keeps a single quiet row with a mega menu for the catalogue; mobile
 * collapses to logo + three touch targets and a full-height menu drawer.
 * Every control here does something — nothing is decorative.
 */

interface HeaderProps {
  storeName: string;
  categories: NavCategory[];
  series: NavSeries[];
  signedIn: boolean;
  announcement: { enabled: boolean; text: string; href: string | null };
}

export function Header({ storeName, categories, series, signedIn, announcement }: HeaderProps) {
  const pathname = usePathname();
  const { itemCount, openDrawer } = useCart();
  const { count: wishlistCount } = useWishlist();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [megaOpen, setMegaOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const megaTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setMenuOpen(false);
    setMegaOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ⌘K / Ctrl-K opens search, as people now expect.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openMega = () => {
    if (megaTimer.current) clearTimeout(megaTimer.current);
    setMegaOpen(true);
  };
  const closeMega = () => {
    if (megaTimer.current) clearTimeout(megaTimer.current);
    megaTimer.current = setTimeout(() => setMegaOpen(false), 120);
  };

  const navLinks = [
    { href: '/shop', label: 'Shop' },
    { href: '/shop?availability=in-stock&sort=bestselling', label: 'Best sellers' },
    { href: '/deals', label: 'Deals' },
    { href: '/about', label: 'About' },
  ];

  return (
    <>
      {announcement.enabled && (
        <div className="bg-ink text-canvas">
          <div className="container flex h-9 items-center justify-center">
            {announcement.href ? (
              <Link href={announcement.href} className="text-2xs uppercase tracking-[0.14em] hover:underline underline-offset-4">
                {announcement.text}
              </Link>
            ) : (
              <span className="text-2xs uppercase tracking-[0.14em]">{announcement.text}</span>
            )}
          </div>
        </div>
      )}

      <header
        className={cn(
          'sticky top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
          scrolled
            ? 'border-hairline bg-canvas/85 backdrop-blur-xl supports-[backdrop-filter]:bg-canvas/70'
            : 'border-transparent bg-canvas',
        )}
      >
        <div className="container flex h-16 items-center gap-4 lg:h-[72px]">
          <button
            type="button"
            className="-ml-2 rounded p-2 text-ink lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href="/" className="shrink-0" aria-label={`${storeName} — home`}>
            <span className="font-display text-2xl tracking-[0.18em] text-ink">{storeName}</span>
          </Link>

          <nav className="ml-8 hidden items-center gap-7 lg:flex" aria-label="Main">
            <div className="relative" onMouseEnter={openMega} onMouseLeave={closeMega}>
              <button
                type="button"
                className="flex items-center gap-1 py-2 text-[13px] font-medium tracking-tight text-muted transition-colors hover:text-ink"
                aria-expanded={megaOpen}
                aria-haspopup="true"
                onClick={() => setMegaOpen((v) => !v)}
              >
                iPhone
              </button>
              {megaOpen && (
                <MegaMenu categories={categories} series={series} onNavigate={() => setMegaOpen(false)} />
              )}
            </div>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'py-2 text-[13px] font-medium tracking-tight transition-colors hover:text-ink',
                  pathname === link.href.split('?')[0] ? 'text-ink' : 'text-muted',
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden items-center gap-2 rounded border border-hairline px-3 py-2 text-xs text-faint
                         transition-colors hover:border-ink/25 hover:text-muted lg:flex"
              aria-label="Search products"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search</span>
              <kbd className="ml-4 rounded-xs border border-hairline px-1 py-px text-[10px] text-faint">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="rounded p-2.5 text-ink lg:hidden"
              aria-label="Search products"
            >
              <Search className="h-5 w-5" />
            </button>

            <CurrencySwitcher />
            <ThemeToggle />

            <Link
              href="/wishlist"
              className="relative hidden rounded p-2.5 text-ink transition-colors hover:text-accent sm:block"
              aria-label={`Saved items${wishlistCount ? ` (${wishlistCount})` : ''}`}
            >
              <Heart className="h-[18px] w-[18px]" />
              {wishlistCount > 0 && <Dot />}
            </Link>

            <Link
              href={signedIn ? '/account' : '/signin'}
              className="rounded p-2.5 text-ink transition-colors hover:text-accent"
              aria-label={signedIn ? 'Your account' : 'Sign in'}
            >
              <User className="h-[18px] w-[18px]" />
            </Link>

            <button
              type="button"
              onClick={openDrawer}
              className="relative rounded p-2.5 text-ink transition-colors hover:text-accent"
              aria-label={`Your bag${itemCount ? `, ${itemCount} item${itemCount === 1 ? '' : 's'}` : ', empty'}`}
            >
              <ShoppingBag className="h-[18px] w-[18px]" />
              {itemCount > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center
                             rounded-full bg-accent px-1 text-[10px] font-semibold tabular text-accent-ink"
                >
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title={storeName} side="left" widthClass="sm:max-w-sm">
        <MobileMenu categories={categories} series={series} signedIn={signedIn} />
      </Drawer>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

function Dot() {
  return <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />;
}

function MegaMenu({
  categories,
  series,
  onNavigate,
}: {
  categories: NavCategory[];
  series: NavSeries[];
  onNavigate: () => void;
}) {
  const stocked = categories.filter((c) => c.productCount > 0);
  const upcoming = categories.filter((c) => c.productCount === 0);

  return (
    <div className="absolute left-1/2 top-full z-50 w-[min(940px,92vw)] -translate-x-1/2 pt-3 animate-fade-up">
      <div className="grid grid-cols-[1.6fr_1fr] gap-8 rounded-lg border border-hairline bg-elevated p-7 shadow-floating">
        <div>
          <p className="eyebrow mb-4">Shop by series</p>
          <div className="grid grid-cols-3 gap-x-6 gap-y-1">
            {series.map((item) => (
              <Link
                key={item.slug}
                href={`/shop?series=${item.slug}`}
                onClick={onNavigate}
                className="group flex items-baseline justify-between rounded px-2 py-2 transition-colors hover:bg-ink/5"
              >
                <span className="text-sm text-ink">{item.name}</span>
                <span className="text-2xs tabular text-faint">{item.productCount}</span>
              </Link>
            ))}
          </div>

          <div className="mt-6 border-t border-hairline pt-5">
            <p className="eyebrow mb-3">Shop by storage</p>
            <div className="flex flex-wrap gap-2">
              {['64gb', '128gb', '256gb'].map((value) => (
                <Link
                  key={value}
                  href={`/shop?storage=${value}`}
                  onClick={onNavigate}
                  className="rounded-xs border border-hairline px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  {value.replace('gb', ' GB').toUpperCase()}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="border-l border-hairline pl-8">
          <p className="eyebrow mb-4">Categories</p>
          <ul className="space-y-1">
            {stocked.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/shop?category=${category.slug}`}
                  onClick={onNavigate}
                  className="flex items-center justify-between rounded px-2 py-2 text-sm text-ink transition-colors hover:bg-ink/5"
                >
                  {category.name}
                  <ChevronRight className="h-3.5 w-3.5 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
          {upcoming.length > 0 && (
            <>
              <p className="eyebrow mb-2 mt-5">Coming soon</p>
              <p className="px-2 text-xs leading-relaxed text-faint">
                {upcoming.map((c) => c.name).join(' · ')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileMenu({
  categories,
  series,
  signedIn,
}: {
  categories: NavCategory[];
  series: NavSeries[];
  signedIn: boolean;
}) {
  return (
    <div className="px-5 py-5">
      <div className="space-y-1">
        {[
          { href: '/shop', label: 'Shop everything' },
          { href: '/deals', label: 'Deals' },
          { href: '/wishlist', label: 'Saved items' },
          { href: signedIn ? '/account' : '/signin', label: signedIn ? 'Your account' : 'Sign in' },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center justify-between rounded px-3 py-3 text-[15px] text-ink transition-colors hover:bg-ink/5"
          >
            {link.label}
            <ChevronRight className="h-4 w-4 text-faint" />
          </Link>
        ))}
      </div>

      <p className="eyebrow mb-2 mt-7 px-3">iPhone series</p>
      <div className="space-y-0.5">
        {series.map((item) => (
          <Link
            key={item.slug}
            href={`/shop?series=${item.slug}`}
            className="flex items-center justify-between rounded px-3 py-2.5 text-sm text-muted transition-colors hover:bg-ink/5 hover:text-ink"
          >
            {item.name}
            <span className="text-2xs tabular text-faint">{item.productCount}</span>
          </Link>
        ))}
      </div>

      <p className="eyebrow mb-2 mt-7 px-3">Categories</p>
      <div className="space-y-0.5">
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/shop?category=${category.slug}`}
            className={cn(
              'flex items-center justify-between rounded px-3 py-2.5 text-sm transition-colors hover:bg-ink/5',
              category.productCount > 0 ? 'text-muted hover:text-ink' : 'pointer-events-none text-faint',
            )}
          >
            {category.name}
            <span className="text-2xs text-faint">{category.productCount || 'soon'}</span>
          </Link>
        ))}
      </div>

      <div className="mt-8 space-y-0.5 border-t border-hairline pt-5">
        {[
          ['/pages/delivery', 'Delivery'],
          ['/pages/warranty', 'Warranty'],
          ['/pages/returns', 'Returns'],
          ['/faq', 'FAQ'],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="block rounded px-3 py-2 text-[13px] text-muted hover:text-ink">
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function CurrencySwitcher() {
  const { currency, supported, setCurrency } = useCurrency();
  if (supported.length < 2) return null;

  return (
    <label className="relative hidden sm:block">
      <span className="sr-only">Display currency</span>
      <select
        value={currency.code}
        onChange={(event) => setCurrency(event.target.value)}
        className="cursor-pointer appearance-none rounded bg-transparent px-2 py-2 text-xs font-medium
                   tracking-wide text-muted transition-colors hover:text-ink focus-visible:ring-2"
      >
        {supported.map((option) => (
          <option key={option.code} value={option.code}>
            {option.code}
          </option>
        ))}
      </select>
    </label>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="rounded p-2.5 text-ink transition-colors hover:text-accent"
      aria-label={mounted ? `Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode` : 'Switch theme'}
    >
      {mounted && resolvedTheme === 'dark' ? (
        <Sun className="h-[18px] w-[18px]" />
      ) : (
        <Moon className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}
