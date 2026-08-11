import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildContentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    // React, React Flow, charting, and drag/drop components calculate geometry
    // at runtime. Keep their style attributes scoped here instead of granting
    // broad inline stylesheet or script execution.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

// Next.js 16 uses the proxy convention for request-time route protection.
// Authentication itself stays in backend-core through the HttpOnly session.
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next.js reads the request CSP and applies its nonce to framework-generated
  // scripts and styles during server rendering.
  requestHeaders.set('content-security-policy', contentSecurityPolicy);

  const session = request.cookies.get('septimus_session');
  const protectedPaths = [
    '/admin',
    '/crm',
    '/dashboard',
    '/finance',
    '/hr',
    '/meetings',
    '/plugins',
    '/settings',
    '/workflows',
  ];
  const isProtectedPath = protectedPaths.some(
    (path) =>
      request.nextUrl.pathname === path ||
      request.nextUrl.pathname.startsWith(`${path}/`),
  );

  if (isProtectedPath && !session) {
    const response = NextResponse.redirect(new URL('/', request.url));
    response.headers.set('Content-Security-Policy', contentSecurityPolicy);
    return response;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    // Ignore API routes and immutable Next.js assets.
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
