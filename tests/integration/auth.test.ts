import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Authentication and authorisation, end to end against the database.
 *
 * `next/headers` is replaced with an in-memory cookie jar so the real session
 * code — token minting, hashing, expiry, revocation, CSRF — can run outside a
 * request. Everything else is production code and a real Prisma client.
 */

const jar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const { prisma } = await import('@/lib/db');
const auth = await import('@/lib/auth');
const { hasTestDb } = await import('../helpers/fixtures');

const suite = hasTestDb ? describe : describe.skip;

async function makeUser(roleKey: string, email = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`) {
  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!role) throw new Error(`Seed is missing the ${roleKey} role.`);
  return prisma.user.create({
    data: {
      email,
      passwordHash: await auth.hashPassword('CorrectHorse9'),
      firstName: 'Test',
      lastName: 'User',
      roleId: role.id,
      active: true,
      emailVerified: new Date(),
    },
  });
}

suite('passwords', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('hashes with bcrypt at cost 12 and never stores the plaintext', async () => {
    const hash = await auth.hashPassword('CorrectHorse9');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(hash).not.toContain('CorrectHorse9');
  });

  it('produces a different hash every time', async () => {
    const [a, b] = await Promise.all([auth.hashPassword('CorrectHorse9'), auth.hashPassword('CorrectHorse9')]);
    expect(a).not.toBe(b);
    expect(await auth.verifyPassword('CorrectHorse9', a)).toBe(true);
    expect(await auth.verifyPassword('CorrectHorse9', b)).toBe(true);
  });

  it('rejects the wrong password and a missing hash alike', async () => {
    const hash = await auth.hashPassword('CorrectHorse9');
    expect(await auth.verifyPassword('correcthorse9', hash)).toBe(false);
    expect(await auth.verifyPassword('', hash)).toBe(false);
    // A user with no password (OAuth-only, or not yet set) must not be a bypass.
    expect(await auth.verifyPassword('anything', null)).toBe(false);
  });

  it('enforces a minimum password quality', () => {
    expect(auth.assessPasswordStrength('short1A').ok).toBe(false);
    expect(auth.assessPasswordStrength('alllowercase1').ok).toBe(false);
    expect(auth.assessPasswordStrength('NoNumbersHere').ok).toBe(false);
    expect(auth.assessPasswordStrength('CorrectHorse9').ok).toBe(true);
  });
});

suite('sessions', () => {
  beforeEach(() => jar.clear());

  it('stores only a hash of the session token, never the token itself', async () => {
    const user = await makeUser('SUPPORT');
    await auth.createSession(user.id);

    const cookie = jar.get(auth.SESSION_COOKIE)!;
    expect(cookie).toBeTruthy();

    const rows = await prisma.session.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(auth.sha256(cookie));
    expect(rows[0].tokenHash).not.toBe(cookie);
    expect(JSON.stringify(rows[0])).not.toContain(cookie);
  });

  it('resolves the signed-in user with the permissions of their role', async () => {
    const user = await makeUser('FINANCE');
    await auth.createSession(user.id);

    const session = await auth.getSessionUser();
    expect(session).toMatchObject({ id: user.id, role: 'FINANCE' });
    expect(session!.permissions).toContain('payment:refund');
    expect(session!.permissions).not.toContain('user:manage');
  });

  it('returns nobody when there is no cookie, or a forged one', async () => {
    expect(await auth.getSessionUser()).toBeNull();
    jar.set(auth.SESSION_COOKIE, auth.newOpaqueToken());
    expect(await auth.getSessionUser()).toBeNull();
  });

  it('refuses an expired session', async () => {
    const user = await makeUser('SUPPORT');
    await auth.createSession(user.id);
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await auth.getSessionUser()).toBeNull();
  });

  it('refuses a session belonging to a suspended account', async () => {
    const user = await makeUser('ORDER_MANAGER');
    await auth.createSession(user.id);
    expect(await auth.getSessionUser()).not.toBeNull();

    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    expect(await auth.getSessionUser()).toBeNull();
  });

  it('signing out clears the cookie and revokes the row, keeping the trail', async () => {
    const user = await makeUser('SUPPORT');
    await auth.createSession(user.id);
    const token = jar.get(auth.SESSION_COOKIE)!;

    await auth.destroySession();
    expect(jar.get(auth.SESSION_COOKIE)).toBeFalsy();

    // The row is revoked rather than deleted, so "signed out at" stays auditable…
    const row = await prisma.session.findFirst({ where: { userId: user.id } });
    expect(row!.revokedAt).toBeTruthy();

    // …and replaying the old cookie gets nowhere.
    jar.set(auth.SESSION_COOKIE, token);
    expect(await auth.getSessionUser()).toBeNull();
  });

  it('revoking all sessions logs the person out everywhere at once', async () => {
    const user = await makeUser('SUPPORT');
    await auth.createSession(user.id);
    const first = jar.get(auth.SESSION_COOKIE)!;
    jar.clear();
    await auth.createSession(user.id); // a second device
    const second = jar.get(auth.SESSION_COOKIE)!;
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(2);

    await auth.revokeAllSessions(user.id);
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);

    for (const token of [first, second]) {
      jar.set(auth.SESSION_COOKIE, token);
      expect(await auth.getSessionUser()).toBeNull();
    }
  });

  it('mints tokens with enough entropy to be unguessable', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => auth.newOpaqueToken()));
    expect(tokens.size).toBe(200);
    expect(auth.newOpaqueToken()).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });
});

suite('permission gates', () => {
  beforeEach(() => jar.clear());

  it('turns an anonymous visitor away from anything that needs a session', async () => {
    await expect(auth.requireUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(auth.requirePermission('order:read')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('lets a role through for what it is allowed to do', async () => {
    const user = await makeUser('ORDER_MANAGER');
    await auth.createSession(user.id);
    await expect(auth.requirePermission('order:write')).resolves.toMatchObject({ id: user.id });
  });

  it('forbids a role from what it is not allowed to do', async () => {
    const user = await makeUser('SUPPORT');
    await auth.createSession(user.id);
    await expect(auth.requirePermission('product:write')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(auth.requirePermission('user:manage')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(auth.requirePermission('payment:refund')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('keeps a storefront customer out of the admin entirely', async () => {
    const user = await makeUser('CUSTOMER');
    await auth.createSession(user.id);
    for (const permission of ['dashboard:view', 'order:read', 'product:read'] as const) {
      await expect(auth.requirePermission(permission)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('lets a super admin through everywhere', async () => {
    const user = await makeUser('SUPER_ADMIN');
    await auth.createSession(user.id);
    for (const permission of ['user:manage', 'payment:refund', 'settings:write'] as const) {
      await expect(auth.requirePermission(permission)).resolves.toBeTruthy();
    }
  });

  it('accepts any one of a set of permissions', async () => {
    const user = await makeUser('SUPPORT');
    await auth.createSession(user.id);
    await expect(auth.requireAnyPermission(['product:write', 'order:read'])).resolves.toBeTruthy();
    await expect(auth.requireAnyPermission(['product:write', 'user:manage'])).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

suite('CSRF', () => {
  beforeEach(() => jar.clear());

  function post(headers: Record<string, string> = {}) {
    return new Request('http://localhost/api/cart', { method: 'POST', headers });
  }

  it('lets safe methods through untouched', async () => {
    await expect(auth.assertCsrf(new Request('http://localhost/api/cart'))).resolves.toBeUndefined();
  });

  it('accepts a request that echoes the cookie back in the header', async () => {
    const token = await auth.ensureCsrfToken();
    await expect(auth.assertCsrf(post({ [auth.CSRF_HEADER]: token }))).resolves.toBeUndefined();
  });

  it('reuses the existing token rather than rotating it on every render', async () => {
    const first = await auth.ensureCsrfToken();
    expect(await auth.ensureCsrfToken()).toBe(first);
  });

  it('rejects a mutation with no header, no cookie, or a mismatched pair', async () => {
    const token = await auth.ensureCsrfToken();
    await expect(auth.assertCsrf(post())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(auth.assertCsrf(post({ [auth.CSRF_HEADER]: `${token}x` }))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(auth.assertCsrf(post({ [auth.CSRF_HEADER]: auth.newOpaqueToken(24) }))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    jar.delete(auth.CSRF_COOKIE);
    await expect(auth.assertCsrf(post({ [auth.CSRF_HEADER]: token }))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('never leaks why it failed', async () => {
    const error = await auth.assertCsrf(post()).catch((e: Error) => e);
    expect((error as Error).message).not.toMatch(/csrf|token|header/i);
  });
});
