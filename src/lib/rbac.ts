import type { RoleKey } from '@/types/enums';

/**
 * Role-based access control.
 *
 * Permissions are the unit of authorisation; roles are bundles of them. Every
 * admin API route and every admin page names the permission it needs, so
 * adding a role never means auditing route lists.
 */

export const PERMISSIONS = {
  'dashboard:view': { group: 'general', description: 'View the admin dashboard' },

  'product:read': { group: 'catalog', description: 'View products and catalogue data' },
  'product:write': { group: 'catalog', description: 'Create, edit, duplicate and delete products' },
  'product:publish': { group: 'catalog', description: 'Activate or deactivate products' },
  'price:write': { group: 'catalog', description: 'Change prices and price schedules' },
  'taxonomy:write': { group: 'catalog', description: 'Manage categories, brands, series and attributes' },

  'inventory:read': { group: 'inventory', description: 'View stock levels and movements' },
  'inventory:write': { group: 'inventory', description: 'Adjust stock' },

  'order:read': { group: 'orders', description: 'View orders' },
  'order:write': { group: 'orders', description: 'Update order status, fulfilment and notes' },
  'order:cancel': { group: 'orders', description: 'Cancel orders' },

  'customer:read': { group: 'customers', description: 'View customer accounts' },
  'customer:write': { group: 'customers', description: 'Edit customer accounts' },

  'payment:read': { group: 'payments', description: 'View transactions and payment events' },
  'payment:refund': { group: 'payments', description: 'Issue refunds' },
  'payment:configure': { group: 'payments', description: 'Change payment provider configuration' },

  'marketing:write': { group: 'marketing', description: 'Manage coupons, promotions and merchandising' },
  'content:write': { group: 'content', description: 'Edit pages, banners and FAQs' },
  'analytics:read': { group: 'analytics', description: 'View analytics and reports' },

  'settings:read': { group: 'settings', description: 'View store settings' },
  'settings:write': { group: 'settings', description: 'Change store settings' },
  'user:manage': { group: 'settings', description: 'Manage admin users and roles' },
  'audit:read': { group: 'settings', description: 'Read the audit log' },
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_DEFINITIONS: Record<
  RoleKey,
  { name: string; description: string; permissions: Permission[] | '*' }
> = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    description: 'Unrestricted access to every area of the store.',
    permissions: '*',
  },
  PRODUCT_MANAGER: {
    name: 'Product Manager',
    description: 'Catalogue, pricing and inventory.',
    permissions: [
      'dashboard:view',
      'product:read',
      'product:write',
      'product:publish',
      'price:write',
      'taxonomy:write',
      'inventory:read',
      'inventory:write',
      'content:write',
      'analytics:read',
      'marketing:write',
    ],
  },
  ORDER_MANAGER: {
    name: 'Order Manager',
    description: 'Orders, fulfilment and delivery.',
    permissions: [
      'dashboard:view',
      'order:read',
      'order:write',
      'order:cancel',
      'customer:read',
      'inventory:read',
      'product:read',
      'payment:read',
      'analytics:read',
    ],
  },
  FINANCE: {
    name: 'Finance',
    description: 'Payments, refunds and financial reporting.',
    permissions: [
      'dashboard:view',
      'order:read',
      'payment:read',
      'payment:refund',
      'payment:configure',
      'customer:read',
      'analytics:read',
      'settings:read',
      'audit:read',
    ],
  },
  SUPPORT: {
    name: 'Support Agent',
    description: 'Read-only access to orders and customers for support.',
    permissions: ['dashboard:view', 'order:read', 'customer:read', 'product:read', 'inventory:read'],
  },
  CUSTOMER: {
    name: 'Customer',
    description: 'Storefront account. No admin access.',
    permissions: [],
  },
};

export function permissionsForRole(role: RoleKey): Permission[] {
  const def = ROLE_DEFINITIONS[role];
  if (!def) return [];
  return def.permissions === '*' ? [...ALL_PERMISSIONS] : def.permissions;
}

export function roleHasPermission(role: RoleKey, permission: Permission): boolean {
  if (role === 'SUPER_ADMIN') return true;
  return permissionsForRole(role).includes(permission);
}

export function hasPermission(granted: readonly string[], permission: Permission): boolean {
  return granted.includes('*') || granted.includes(permission);
}

export function hasAnyPermission(granted: readonly string[], permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(granted, p));
}
