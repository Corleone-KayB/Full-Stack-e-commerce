'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  BarChart3,
  Boxes,
  ChevronDown,
  CreditCard,
  ExternalLink,
  FileText,
  LayoutDashboard,
  Megaphone,
  Menu,
  Moon,
  Package,
  Settings,
  ShoppingCart,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { Drawer } from '@/components/ui';
import type { Permission } from '@/lib/rbac';
import { SignOutButton } from '@/components/store/auth-forms';

/**
 * Admin shell.
 *
 * The sidebar is filtered by the signed-in user's permissions, so a Support
 * Agent simply does not see Settings. That is presentation only — every page
 * and every endpoint behind these links checks the same permission on the
 * server.
 */

export interface NavItem {
  label: string;
  href: string;
  permission?: Permission;
  badge?: number;
}

export interface NavGroup {
  label: string;
  icon: React.ReactNode;
  href?: string;
  permission?: Permission;
  items?: NavItem[];
}

export function buildNav(counts: { pendingOrders: number; lowStock: number }): NavGroup[] {
  return [
    { label: 'Dashboard', href: '/admin', icon: <LayoutDashboard className="h-4 w-4" />, permission: 'dashboard:view' },
    {
      label: 'Catalog',
      icon: <Package className="h-4 w-4" />,
      permission: 'product:read',
      items: [
        { label: 'Products', href: '/admin/products' },
        { label: 'Categories', href: '/admin/catalog/categories' },
        { label: 'Brands', href: '/admin/catalog/brands' },
        { label: 'Series', href: '/admin/catalog/series' },
        { label: 'Attributes', href: '/admin/catalog/attributes' },
        { label: 'Import / export', href: '/admin/catalog/import-export', permission: 'product:write' },
      ],
    },
    {
      label: 'Inventory',
      icon: <Boxes className="h-4 w-4" />,
      permission: 'inventory:read',
      items: [
        { label: 'Stock', href: '/admin/inventory', badge: counts.lowStock || undefined },
        { label: 'Movements', href: '/admin/inventory/movements' },
      ],
    },
    {
      label: 'Orders',
      icon: <ShoppingCart className="h-4 w-4" />,
      permission: 'order:read',
      items: [
        { label: 'All orders', href: '/admin/orders' },
        { label: 'Pending', href: '/admin/orders?status=PENDING', badge: counts.pendingOrders || undefined },
        { label: 'Processing', href: '/admin/orders?status=PROCESSING' },
        { label: 'Completed', href: '/admin/orders?status=DELIVERED' },
        { label: 'Cancelled', href: '/admin/orders?status=CANCELLED' },
      ],
    },
    { label: 'Customers', href: '/admin/customers', icon: <Users className="h-4 w-4" />, permission: 'customer:read' },
    {
      label: 'Payments',
      icon: <CreditCard className="h-4 w-4" />,
      permission: 'payment:read',
      items: [
        { label: 'Transactions', href: '/admin/payments' },
        { label: 'Providers', href: '/admin/payments/providers' },
        { label: 'Failed', href: '/admin/payments?status=FAILED' },
      ],
    },
    {
      label: 'Marketing',
      icon: <Megaphone className="h-4 w-4" />,
      permission: 'marketing:write',
      items: [
        { label: 'Coupons', href: '/admin/marketing/coupons' },
        { label: 'Promotions', href: '/admin/marketing/promotions' },
      ],
    },
    { label: 'Analytics', href: '/admin/analytics', icon: <BarChart3 className="h-4 w-4" />, permission: 'analytics:read' },
    {
      label: 'Content',
      icon: <FileText className="h-4 w-4" />,
      permission: 'content:write',
      items: [
        { label: 'Pages', href: '/admin/content/pages' },
        { label: 'FAQs', href: '/admin/content/faqs' },
        { label: 'Banners', href: '/admin/content/banners' },
      ],
    },
    {
      label: 'Settings',
      icon: <Settings className="h-4 w-4" />,
      permission: 'settings:read',
      items: [
        { label: 'Store', href: '/admin/settings' },
        { label: 'Payments', href: '/admin/settings/payments' },
        { label: 'Delivery', href: '/admin/settings/delivery' },
        { label: 'Currency', href: '/admin/settings/currency' },
        { label: 'Notifications', href: '/admin/settings/notifications' },
        { label: 'Users & roles', href: '/admin/settings/users', permission: 'user:manage' },
        { label: 'Audit log', href: '/admin/settings/audit', permission: 'audit:read' },
      ],
    },
  ];
}

export function AdminShell({
  children,
  user,
  permissions,
  counts,
  storeName,
}: {
  children: React.ReactNode;
  user: { email: string; firstName: string | null; lastName: string | null; role: string };
  permissions: string[];
  counts: { pendingOrders: number; lowStock: number };
  storeName: string;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();
  const nav = React.useMemo(() => buildNav(counts), [counts]);

  const allowed = (permission?: Permission) =>
    !permission || permissions.includes('*') || permissions.includes(permission);

  const visible = nav
    .filter((group) => allowed(group.permission))
    .map((group) => ({ ...group, items: group.items?.filter((item) => allowed(item.permission)) }))
    .filter((group) => group.href || (group.items && group.items.length > 0));

  React.useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-hairline bg-surface lg:flex">
        <SidebarContent nav={visible} storeName={storeName} user={user} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hairline bg-canvas/90 px-4 backdrop-blur-xl lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="-ml-2 rounded p-2 text-ink lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Breadcrumbs pathname={pathname} nav={nav} />

          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/"
              target="_blank"
              className="hidden items-center gap-1.5 rounded px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink sm:flex"
            >
              View store
              <ExternalLink className="h-3 w-3" />
            </Link>
            <ThemeToggle />
            <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-accent/12 text-xs font-medium text-accent">
              {initials(user.firstName, user.lastName, user.email)}
            </span>
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>

      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} title={storeName} side="left" widthClass="sm:max-w-xs">
        <SidebarContent nav={visible} storeName={storeName} user={user} compact />
      </Drawer>
    </div>
  );
}

function SidebarContent({
  nav,
  storeName,
  user,
  compact,
}: {
  nav: NavGroup[];
  storeName: string;
  user: { email: string; firstName: string | null; lastName: string | null; role: string };
  compact?: boolean;
}) {
  const pathname = usePathname();

  return (
    <>
      {!compact && (
        <div className="flex h-14 items-center border-b border-hairline px-5">
          <Link href="/admin" className="font-display text-xl tracking-[0.16em] text-ink">
            {storeName}
          </Link>
          <span className="ml-2 rounded-xs bg-accent/12 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-accent">
            Admin
          </span>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin">
        <ul className="space-y-0.5">
          {nav.map((group) => (
            <NavGroupItem key={group.label} group={group} pathname={pathname} />
          ))}
        </ul>
      </nav>

      <div className="border-t border-hairline p-4">
        <p className="truncate text-[13px] text-ink">
          {user.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : user.email}
        </p>
        <p className="mb-3 text-2xs uppercase tracking-wider text-faint">{user.role.replace(/_/g, ' ')}</p>
        <SignOutButton />
      </div>
    </>
  );
}

function NavGroupItem({ group, pathname }: { group: NavGroup; pathname: string }) {
  const childActive = group.items?.some((item) => pathname === item.href.split('?')[0]);
  const [open, setOpen] = React.useState(!!childActive);

  React.useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  if (group.href) {
    const active = pathname === group.href;
    return (
      <li>
        <Link
          href={group.href}
          className={cn(
            'flex items-center gap-2.5 rounded px-3 py-2 text-[13px] transition-colors',
            active ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-ink/5 hover:text-ink',
          )}
        >
          {group.icon}
          {group.label}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2.5 rounded px-3 py-2 text-[13px] transition-colors',
          childActive ? 'text-ink' : 'text-muted hover:bg-ink/5 hover:text-ink',
        )}
      >
        {group.icon}
        {group.label}
        <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="ml-[26px] mt-0.5 space-y-0.5 border-l border-hairline pl-3">
          {group.items?.map((item) => {
            const active = pathname + (typeof window === 'undefined' ? '' : window.location.search) === item.href;
            const pathActive = pathname === item.href.split('?')[0];
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center justify-between rounded px-2.5 py-1.5 text-[13px] transition-colors',
                    active || (pathActive && !item.href.includes('?'))
                      ? 'text-accent'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {item.label}
                  {item.badge ? (
                    <span className="rounded-full bg-caution/15 px-1.5 text-[10px] tabular text-caution">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * Breadcrumbs.
 *
 * A path segment is not automatically a page. `/admin/catalog/attributes` has
 * no page at `/admin/catalog` — "catalog" is a grouping in the menu, nothing
 * more. Linking it anyway gives a crumb that 404s on click, and Next prefetches
 * it on sight, so the browser console fills with 404s nobody asked for.
 *
 * So a crumb is a link only when the navigation actually knows that route.
 * Add a group tomorrow and this stays correct on its own.
 */
function Breadcrumbs({ pathname, nav }: { pathname: string; nav: NavGroup[] }) {
  const routes = React.useMemo(() => {
    const set = new Set<string>(['/admin']);
    for (const group of nav) {
      if (group.href) set.add(group.href.split('?')[0]);
      for (const item of group.items ?? []) set.add(item.href.split('?')[0]);
    }
    return set;
  }, [nav]);

  const segments = pathname.split('/').filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-[13px]">
        {segments.map((segment, index) => {
          const href = `/${segments.slice(0, index + 1).join('/')}`;
          const isLast = index === segments.length - 1;
          const label = segment === 'admin' ? 'Dashboard' : segment.replace(/-/g, ' ');
          return (
            <li key={href} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && <span className="text-faint">/</span>}
              {isLast || !routes.has(href) ? (
                <span className={cn('truncate capitalize', isLast ? 'text-ink' : 'text-muted')}>{label}</span>
              ) : (
                <Link href={href} className="truncate capitalize text-muted hover:text-ink">
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
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
      className="rounded p-2 text-muted transition-colors hover:text-ink"
      aria-label="Switch theme"
    >
      {mounted && resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export { X };
