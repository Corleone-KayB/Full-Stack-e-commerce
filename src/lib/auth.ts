import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { AppError, forbidden, unauthenticated } from './errors';
import { hasPermission, type Permission, permissionsForRole } from './rbac';
import type { RoleKey } from '@/types/enums';
import { logger } from './logger';

export const SESSION_COOKIE = 'aurum_session';
export const CART_COOKIE = 'aurum_cart';
export const GUEST_COOKIE = 'aurum_guest';
export const CSRF_COOKIE = 'aurum_csrf';
export const CSRF_HEADER = 'x-aurum-csrf';

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 30);
const isProd = process.env.NODE_ENV === 'production';

export interface SessionUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: RoleKey;
  permissions: Permission[];
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

/** bcrypt, cost 12. Never log, never return, never compare with ===. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) {
    // Burn comparable time so a missing account is not distinguishable by timing.
    await bcrypt.compare(plain, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    return false;
  }
  return bcrypt.compare(plain, hash);
}

export function assessPasswordStrength(password: string): { ok: boolean; reason?: string } {
  if (password.length < 10) return { ok: false, reason: 'Use at least 10 characters.' };
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password))
    return { ok: false, reason: 'Mix upper and lower case letters.' };
  if (!/\d/.test(password)) return { ok: false, reason: 'Include at least one number.' };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Session tokens
// ---------------------------------------------------------------------------

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function newOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<string> {
  const token = newOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Resolves the signed-in user, or null. Safe to call from any server context. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { role: true } } },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (!session.user.active) return null;

  const roleKey = session.user.role.key as RoleKey;
  return {
    id: session.user.id,
    email: session.user.email,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    phone: session.user.phone,
    role: roleKey,
    permissions: permissionsForRole(roleKey),
    isAdmin: roleKey !== 'CUSTOMER',
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthenticated();
  return user;
}

/** Guard for admin API routes and pages. Throws 401 then 403, never leaks. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin || !hasPermission(user.permissions, permission)) {
    logger.warn('rbac.denied', { userId: user.id, role: user.role, permission });
    throw forbidden();
  }
  return user;
}

export async function requireAnyPermission(permissions: Permission[]): Promise<SessionUser> {
  const user = await requireUser();
  const allowed = permissions.some((p) => hasPermission(user.permissions, p));
  if (!user.isAdmin || !allowed) throw forbidden();
  return user;
}

/**
 * The same gate, for a page rather than an endpoint.
 *
 * An API route should throw: a 403 with a machine-readable code is exactly
 * what a caller needs. A page should not — a thrown error in a Server
 * Component reaches the generic error boundary, which renders "something went
 * wrong" with a 500, telling a support agent who clicked the wrong menu item
 * that the site is broken. It isn't; they simply cannot go there.
 *
 * So a page redirects to a screen that says which permission is missing and
 * where they *can* go. The security is identical — the render stops either
 * way — and only the explanation differs.
 */
export async function requirePagePermission(permission: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/signin?next=/admin');
  if (!user.isAdmin) redirect('/account');
  if (!hasPermission(user.permissions, permission)) {
    logger.warn('rbac.denied', { userId: user.id, role: user.role, permission });
    redirect(`/admin/no-access?need=${encodeURIComponent(permission)}`);
  }
  return user;
}

// ---------------------------------------------------------------------------
// Guest identity (cart + wishlist for people who have not signed in)
// ---------------------------------------------------------------------------

/**
 * The guest cookie is normally minted by middleware, so it already exists by
 * the time anything reads it. This covers the remaining case — an API route
 * hit directly — where a Route Handler *is* allowed to set cookies. Setting a
 * cookie throws inside a Server Component, so that failure is tolerated and
 * the caller still gets a usable token for this request.
 */
export async function getOrCreateGuestToken(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(GUEST_COOKIE)?.value;
  if (existing) return existing;
  const token = newOpaqueToken(24);
  try {
    jar.set(GUEST_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 180,
    });
  } catch {
    // Read-only cookie store (Server Component render) — middleware will set it.
  }
  return token;
}

export async function readGuestToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(GUEST_COOKIE)?.value ?? null;
}

// ---------------------------------------------------------------------------
// CSRF — double-submit cookie
//
// Cookies are SameSite=Lax, which already blocks cross-site form posts. The
// double-submit token closes the gap for same-site subdomain takeover and
// makes the protection explicit and testable.
// ---------------------------------------------------------------------------

export async function ensureCsrfToken(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(CSRF_COOKIE)?.value;
  if (existing) return existing;
  const token = newOpaqueToken(24);
  try {
    jar.set(CSRF_COOKIE, token, {
      httpOnly: false, // must be readable by the client to echo it back
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
  } catch {
    // Middleware owns this cookie; nothing to do during a Server Component render.
  }
  return token;
}

export async function assertCsrf(request: Request): Promise<void> {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  const jar = await cookies();
  const cookieToken = jar.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get(CSRF_HEADER);
  if (!cookieToken || !headerToken) {
    throw new AppError('FORBIDDEN', 'Your session expired. Refresh the page and try again.');
  }
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError('FORBIDDEN', 'Your session expired. Refresh the page and try again.');
  }
}

export { sha256 };
