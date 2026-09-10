import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { jwtSecret } from '@/lib/auth';

export async function POST(request) {
  const { token } = await request.json();
  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwtSecret()));
  } catch {
    return NextResponse.json({ error: 'invalid token' }, { status: 400 });
  }

  // Only customer tokens may be installed here — an admin token must never
  // become a long-lived customer_session cookie.
  if (payload.type !== 'customer' || !payload.customerId) {
    return NextResponse.json({ error: 'invalid token' }, { status: 400 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('customer_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days — matches the token's own expiry
  });
  return response;
}
