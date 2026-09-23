import type { Request, Response } from 'express';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { Db } from '../db/prisma.js';
import { env } from '../../config/env.js';
import { atLeast, levelIn, loadMatrix, type Level } from './permissions.js';

// Port of src/lib/auth.js — the Next `cookies()` store is replaced by the
// request's parsed cookies; every rule and return shape is unchanged.

export function jwtSecret() {
  const s = env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET environment variable is required');
  return new TextEncoder().encode(s);
}

const secret = jwtSecret();
export const COOKIE_NAME = 'auth-token';

export interface AdminSession extends JWTPayload {
  userId?: number;
  email?: string;
  role?: string;
}

export type AuthResult =
  | { session: AdminSession; error?: undefined; status?: undefined }
  // Literal (non-empty) error strings let `if (auth.error) return …` narrow to the session branch.
  | { error: 'Unauthorized' | 'Forbidden'; status: 401 | 403; session?: undefined };

export async function signToken(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifyToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as AdminSession;
  } catch {
    return null;
  }
}

export async function getSession(req: Request): Promise<AdminSession | null> {
  const token: string | undefined = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Gets session and ensures role is present.
 * Falls back to DB lookup for older JWTs missing role.
 */
export async function getSessionWithRole(prisma: Db, req: Request): Promise<AdminSession | null> {
  const session = await getSession(req);
  if (!session) return null;

  if (!session.role && session.userId) {
    const user = await prisma.adminUser.findUnique({
      where: { id: session.userId },
      select: { role: true },
    });
    if (user) return { ...session, role: user.role };
  }

  return session;
}

export async function requireAdmin(prisma: Db, req: Request): Promise<AuthResult> {
  const session = await getSessionWithRole(prisma, req);
  if (!session) return { error: 'Unauthorized', status: 401 };
  if (session.role !== 'admin') return { error: 'Forbidden', status: 403 };
  return { session };
}

// Back-office staff: full dashboard access (orders, inventory, catalog, etc.).
export const STAFF_ROLES = ['admin', 'manager', 'cashier'];

// Roles allowed to use the Register (POS) + their own Performance page.
// Waiters are login accounts (role 'waiter') limited to these two surfaces.
export const POS_ROLES = ['admin', 'manager', 'cashier', 'waiter'];

// Manager tier: finance (expenses, reports), staff, settings, tags.
export const MANAGER_ROLES = ['admin', 'manager'];

// May create/edit/delete the menu: items, categories, option groups,
// options, extras and their images. Waiters are deliberately excluded.
export const CATALOG_ROLES = ['admin', 'manager', 'cashier'];

/**
 * Allows the request only if the session role is one of `roles`.
 * Returns { session } or { error, status }.
 */
export async function requireRole(prisma: Db, req: Request, roles: string[]): Promise<AuthResult> {
  const session = await getSessionWithRole(prisma, req);
  if (!session) return { error: 'Unauthorized', status: 401 };
  if (!roles.includes(session.role as string)) return { error: 'Forbidden', status: 403 };
  return { session };
}

/**
 * Allows the request only if the caller's role has at least `level` on one of
 * `pages` in the role permissions (Settings › Staff access; defaults = the old
 * role lists). One Setting read per call, so a change applies immediately.
 */
export async function requirePage(prisma: Db, req: Request, pages: string | string[], level: Level): Promise<AuthResult> {
  const session = await getSessionWithRole(prisma, req);
  if (!session) return { error: 'Unauthorized', status: 401 };
  if (!(await sessionCan(prisma, session, pages, level))) return { error: 'Forbidden', status: 403 };
  return { session };
}

/** Whether an already-authenticated session has `level` on any of `pages`. */
export async function sessionCan(prisma: Db, session: AdminSession, pages: string | string[], level: Level): Promise<boolean> {
  if (session.role === 'admin') return true;
  const matrix = await loadMatrix(prisma);
  const list = Array.isArray(pages) ? pages : [pages];
  return list.some((p) => atLeast(levelIn(matrix, session.role, p), level));
}

/** Allows any back-office staff member (admin/manager/cashier). */
export async function requireStaff(prisma: Db, req: Request) {
  return requireRole(prisma, req, STAFF_ROLES);
}

/** Allows anyone who can operate the Register (admin/manager/cashier/waiter). */
export async function requirePos(prisma: Db, req: Request) {
  return requireRole(prisma, req, POS_ROLES);
}

// Next's cookie maxAge is in SECONDS; Express's is in MILLISECONDS.
const AUTH_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 7; // 7 days

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_S * 1000,
  });
}
