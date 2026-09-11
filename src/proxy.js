import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Page-level role enforcement for the admin dashboard. API routes guard their
// own data via src/lib/auth.js; this stops a signed-in user from loading a
// dashboard page their role shouldn't see (e.g. a waiter opening Finance).
// Next 16 renamed middleware.js to proxy.js — it must sit in src/, at the
// same level as app/, or it's silently never invoked.
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
const secret = new TextEncoder().encode(process.env.JWT_SECRET);

const STAFF = ['admin', 'manager', 'cashier'];
const MANAGER = ['admin', 'manager'];
const POS = ['admin', 'manager', 'cashier', 'waiter'];
const INVOICE_ROLES = ['admin', 'manager', 'cashier'];
// Cashiers maintain the menu; waiters never do. Mirrors CATALOG_ROLES in lib/auth.js.
const CATALOG = ['admin', 'manager', 'cashier'];

// First match wins. Overview root is exact; everything else is a prefix.
// Overview is the full financial dashboard — manager tier and above only. A
// cashier's home is the Register.
function allowedRoles(pathname) {
  if (pathname === '/admin/dashboard') return MANAGER;
  if (pathname.startsWith('/admin/dashboard/pos')) return POS;
  if (pathname.startsWith('/admin/dashboard/performance')) return POS;
  if (pathname.startsWith('/admin/dashboard/invoices')) return INVOICE_ROLES;
  if (pathname.startsWith('/admin/dashboard/customers')) return INVOICE_ROLES;
  if (pathname.startsWith('/admin/dashboard/reports')) return MANAGER;
  if (pathname.startsWith('/admin/dashboard/insights')) return MANAGER;
  if (pathname.startsWith('/admin/dashboard/expenses')) return MANAGER;
  if (pathname.startsWith('/admin/dashboard/categories')) return CATALOG;
  if (pathname.startsWith('/admin/dashboard/menu-items')) return CATALOG;
  if (pathname.startsWith('/admin/dashboard/users')) return MANAGER;
  if (pathname.startsWith('/admin/dashboard/settings')) return MANAGER;
  // orders, counter-orders, inventory, and anything else → back-office staff
  return STAFF;
}

// Where a role lands when it's bounced off a page it can't see. Overview is
// manager-tier-only, so both cashier and waiter land on the Register —
// without this, a cashier hitting the restricted Overview root would compute
// home === pathname and the redirect would silently never fire.
function homeFor(role) {
  if (role === 'admin' || role === 'manager') return '/admin/dashboard';
  return '/admin/dashboard/pos';
}

export default async function proxy(request) {
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
      const home = homeFor(role);
      if (pathname !== home) return NextResponse.redirect(new URL(home, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/dashboard/:path*'],
};
