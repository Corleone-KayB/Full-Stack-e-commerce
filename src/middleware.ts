import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware.
 *
 * Deliberately does no database work and makes no authorisation decision it
 * cannot back up: it only checks whether a session cookie is *present* so that
 * signed-out visitors are bounced to the sign-in page instead of rendering an
 * admin shell they will not be allowed to fill. Every admin page and every
 * admin API route independently calls requirePermission() on the server —
 * removing this middleware would change the experience, never the security.
 *
 * It also guarantees the two cookies the app needs to exist before any React
 * Server Component runs (a Server Component cannot set cookies).
 */

const GUEST_COOKIE = 'aurum_guest';
const CSRF_COOKIE = 'aurum_csrf';
const SESSION_COOKIE = 'aurum_session';

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProd = process.env.NODE_ENV === 'production';

  // Admin area: require a session cookie to even render the shell.
  if (pathname.startsWith('/admin') && !request.cookies.get(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();

  if (!request.cookies.get(GUEST_COOKIE)) {
    response.cookies.set(GUEST_COOKIE, randomToken(), {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 180,
    });
  }

  // Readable by the client on purpose: it is echoed back in a header, which is
  // what makes the double-submit check work.
  if (!request.cookies.get(CSRF_COOKIE)) {
    response.cookies.set(CSRF_COOKIE, randomToken(), {
      httpOnly: false,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the payment webhooks — a provider
     * callback must not be handed a redirect or a Set-Cookie.
     */
    '/((?!_next/static|_next/image|favicon.ico|products/|brand/|uploads/|api/payments/webhook).*)',
  ],
};
