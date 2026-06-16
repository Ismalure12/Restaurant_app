import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export async function POST(request) {
  const { token } = await request.json();
  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  try {
    await jwtVerify(token, secret);
  } catch {
    return NextResponse.json({ error: 'invalid token' }, { status: 400 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('kfg_auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return response;
}
