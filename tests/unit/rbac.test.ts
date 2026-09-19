import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  hasAnyPermission,
  hasPermission,
  permissionsForRole,
  roleHasPermission,
  ROLE_DEFINITIONS,
  type Permission,
} from '@/lib/rbac';
import { ADMIN_ROLE_KEYS, type RoleKey } from '@/types/enums';

/**
 * Authorisation is checked on the server for every admin page and endpoint.
 * These tests pin the shape of the role bundles, because a permission
 * accidentally added to SUPPORT is a silent privilege escalation.
 */

describe('role definitions', () => {
  it('defines every role key the app can assign', () => {
    for (const key of ADMIN_ROLE_KEYS) {
      expect(ROLE_DEFINITIONS[key as RoleKey], `missing role ${key}`).toBeDefined();
    }
    expect(ROLE_DEFINITIONS.CUSTOMER).toBeDefined();
  });

  it('only ever grants permissions that exist', () => {
    for (const [key, def] of Object.entries(ROLE_DEFINITIONS)) {
      if (def.permissions === '*') continue;
      for (const permission of def.permissions) {
        expect(ALL_PERMISSIONS, `${key} grants unknown ${permission}`).toContain(permission);
      }
    }
  });

  it('gives SUPER_ADMIN everything', () => {
    expect(permissionsForRole('SUPER_ADMIN')).toHaveLength(ALL_PERMISSIONS.length);
    for (const permission of ALL_PERMISSIONS) {
      expect(roleHasPermission('SUPER_ADMIN', permission)).toBe(true);
    }
  });

  it('gives a customer nothing at all', () => {
    expect(permissionsForRole('CUSTOMER')).toEqual([]);
    for (const permission of ALL_PERMISSIONS) {
      expect(roleHasPermission('CUSTOMER', permission)).toBe(false);
    }
  });
});

describe('least privilege', () => {
  const dangerous: Permission[] = [
    'user:manage',
    'settings:write',
    'payment:refund',
    'payment:configure',
    'price:write',
    'product:write',
    'order:cancel',
    'inventory:write',
  ];

  it('keeps support read-only', () => {
    for (const permission of dangerous) {
      expect(roleHasPermission('SUPPORT', permission), `SUPPORT must not have ${permission}`).toBe(false);
    }
    expect(roleHasPermission('SUPPORT', 'order:read')).toBe(true);
    expect(roleHasPermission('SUPPORT', 'customer:read')).toBe(true);
  });

  it('keeps money away from the product manager', () => {
    expect(roleHasPermission('PRODUCT_MANAGER', 'payment:refund')).toBe(false);
    expect(roleHasPermission('PRODUCT_MANAGER', 'payment:configure')).toBe(false);
    expect(roleHasPermission('PRODUCT_MANAGER', 'user:manage')).toBe(false);
    expect(roleHasPermission('PRODUCT_MANAGER', 'price:write')).toBe(true);
  });

  it('keeps the catalogue away from the order manager', () => {
    expect(roleHasPermission('ORDER_MANAGER', 'product:write')).toBe(false);
    expect(roleHasPermission('ORDER_MANAGER', 'price:write')).toBe(false);
    expect(roleHasPermission('ORDER_MANAGER', 'order:write')).toBe(true);
  });

  it('lets finance refund but not edit the catalogue or add users', () => {
    expect(roleHasPermission('FINANCE', 'payment:refund')).toBe(true);
    expect(roleHasPermission('FINANCE', 'audit:read')).toBe(true);
    expect(roleHasPermission('FINANCE', 'product:write')).toBe(false);
    expect(roleHasPermission('FINANCE', 'user:manage')).toBe(false);
    expect(roleHasPermission('FINANCE', 'settings:write')).toBe(false);
  });

  it('reserves user management for the super admin', () => {
    const holders = (ADMIN_ROLE_KEYS as readonly string[]).filter((key) =>
      roleHasPermission(key as RoleKey, 'user:manage'),
    );
    expect(holders).toEqual(['SUPER_ADMIN']);
  });

  it('lets every admin role see the dashboard', () => {
    for (const key of ADMIN_ROLE_KEYS) {
      expect(roleHasPermission(key as RoleKey, 'dashboard:view'), `${key} cannot see the dashboard`).toBe(true);
    }
  });
});

describe('granted-permission checks', () => {
  it('treats the wildcard as everything', () => {
    expect(hasPermission(['*'], 'user:manage')).toBe(true);
    expect(hasPermission(['*'], 'payment:refund')).toBe(true);
  });

  it('is exact — no prefix or namespace matching', () => {
    expect(hasPermission(['order:read'], 'order:write')).toBe(false);
    expect(hasPermission(['product:read'], 'product:publish')).toBe(false);
    expect(hasPermission([], 'dashboard:view')).toBe(false);
  });

  it('answers "any of these" correctly', () => {
    expect(hasAnyPermission(['order:read'], ['order:write', 'order:read'])).toBe(true);
    expect(hasAnyPermission(['order:read'], ['payment:refund', 'user:manage'])).toBe(false);
    expect(hasAnyPermission([], ['order:read'])).toBe(false);
  });

  it('never grants an unknown role anything', () => {
    expect(permissionsForRole('NOT_A_ROLE' as RoleKey)).toEqual([]);
  });
});
