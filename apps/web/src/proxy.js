import { NextResponse } from 'next/server';

// A fast first gate for the dashboard: no login cookie → straight to the login
// page, before any dashboard code is sent. It does NOT verify the cookie — the
// web app holds no secrets. Role checks happen in the dashboard layout
// (src/lib/adminAccess.js), and every piece of data is authorized by the API.
// Next 16 renamed middleware.js to proxy.js — it must sit in src/, at the
// same level as app/, or it's silently never invoked.
export default function proxy(request) {
  if (!request.cookies.get('auth-token')?.value) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/dashboard/:path*'],
};
