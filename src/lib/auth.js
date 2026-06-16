import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const COOKIE_NAME = 'auth-token';

export async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Gets session and ensures role is present.
 * Falls back to DB lookup for older JWTs missing role.
 * Requires prisma to be passed in to avoid circular imports.
 */
export async function getSessionWithRole(prismaClient) {
  const session = await getSession();
  if (!session) return null;

  if (!session.role && session.userId) {
    const user = await prismaClient.adminUser.findUnique({
      where: { id: session.userId },
      select: { role: true },
    });
    if (user) return { ...session, role: user.role };
  }

  return session;
}

export async function requireAdmin(prismaClient) {
  const session = await getSessionWithRole(prismaClient);
  if (!session) return { error: 'Unauthorized', status: 401 };
  if (session.role !== 'admin') return { error: 'Forbidden', status: 403 };
  return { session };
}

// Back-office staff: full dashboard access (orders, inventory, catalog, etc.).
export const STAFF_ROLES = ['admin', 'manager', 'cashier'];

// Roles allowed to use the Register (POS) + their own Performance page.
// Waiters are login accounts (role 'waiter') limited to these two surfaces.
export const POS_ROLES = ['admin', 'manager', 'cashier', 'waiter'];

/**
 * Allows the request only if the session role is one of `roles`.
 * Mirrors requireAdmin's return shape: { session } or { error, status }.
 */
export async function requireRole(prismaClient, roles) {
  const session = await getSessionWithRole(prismaClient);
  if (!session) return { error: 'Unauthorized', status: 401 };
  if (!roles.includes(session.role)) return { error: 'Forbidden', status: 403 };
  return { session };
}

/**
 * Allows any back-office staff member (admin/manager/cashier).
 */
export async function requireStaff(prismaClient) {
  return requireRole(prismaClient, STAFF_ROLES);
}

/**
 * Allows anyone who can operate the Register (admin/manager/cashier/waiter).
 */
export async function requirePos(prismaClient) {
  return requireRole(prismaClient, POS_ROLES);
}

export function createAuthCookie(token) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}
