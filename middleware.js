import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Page-level role enforcement for the admin dashboard. API routes guard their
// own data via src/lib/auth.js; this stops a signed-in user from loading a
// dashboard page their role shouldn't see (e.g. a waiter opening Finance).
const secret = new TextEncoder().encode(process.env.JWT_SECRET);

const STAFF = ['admin', 'manager', 'cashier'];
const MANAGER = ['admin', 'manager'];
const POS = ['admin', 'manager', 'cashier', 'waiter'];

// First match wins. Overview root is exact; everything else is a prefix.
function allowedRoles(pathname) {
  if (pathname === '/admin/dashboard') return STAFF;
  if (pathname.startsWith('/admin/dashboard/pos')) return POS;
  if (pathname.startsWith('/admin/dashboard/performance')) return POS;
  if (pathname.startsWith('/admin/dashboard/insights')) return MANAGER;
  if (pathname.startsWith('/admin/dashboard/categories')) return MANAGER;
  if (pathname.startsWith('/admin/dashboard/menu-items')) return MANAGER;
  if (pathname.startsWith('/admin/dashboard/users')) return MANAGER;
  if (pathname.startsWith('/admin/dashboard/settings')) return MANAGER;
  // orders, counter-orders, inventory, and anything else → back-office staff
  return STAFF;
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('auth-token')?.value;
  const loginUrl = new URL('/admin/login', request.url);

  if (!token) return NextResponse.redirect(loginUrl);

  let role;
  try {
    const { payload } = await jwtVerify(token, secret);
    role = payload.role;
  } catch {
    return NextResponse.redirect(loginUrl);
  }

  // Older tokens may lack a role claim; the page's own /api/auth/me + API
  // guards still apply, so allow through rather than locking the user out.
  if (role) {
    const roles = allowedRoles(pathname);
    if (!roles.includes(role)) {
      const home = role === 'waiter' ? '/admin/dashboard/pos' : '/admin/dashboard';
      if (pathname !== home) return NextResponse.redirect(new URL(home, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/dashboard/:path*'],
};
