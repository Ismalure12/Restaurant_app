import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { jwtVerify, type JWTPayload } from 'jose';
import prisma from '../lib/db/prisma.js';
import { signToken, setAuthCookie, COOKIE_NAME, getSession, jwtSecret } from '../lib/auth/auth.js';
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../validations/auth.validation.js';
import { readJson } from '../utils/body.js';
import { sendResetCode } from '../lib/auth/email.js';
import { errMessage } from '../utils/errors.js';
import { env } from '../config/env.js';
import { loadMatrix, pagesFor } from '../lib/auth/permissions.js';

export async function login(req: Request, res: Response) {
  try {
    const body = readJson(req);
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const { email, password } = parsed.data;

    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = await signToken({ userId: user.id, email: user.email, role: user.role });
    setAuthCookie(res, token);

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function logout(_req: Request, res: Response) {
  // Next: cookies.set('auth-token', '', { maxAge: 0, path: '/' })
  res.cookie(COOKIE_NAME, '', { maxAge: 0, path: '/' });
  return res.json({ success: true });
}

// Who is signed in. The display name isn't in the JWT (and older tokens may
// lack a role), so one lookup fills both — receipts and the sidebar print the
// person's name, never their login email.
export async function getMe(req: Request, res: Response) {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.adminUser.findUnique({
      // Same as the JS: a token without userId makes Prisma throw → 500.
      where: { id: session.userId as number },
      select: { name: true, role: true },
    });

    const role = session.role || user?.role || 'user';
    return res.json({
      userId: session.userId,
      email: session.email,
      role,
      name: user?.name?.trim() || null,
      // What the dashboard may show: { pageKey: 'none' | 'view' | 'act' }.
      permissions: pagesFor(await loadMatrix(prisma), role),
    });
  } catch (err) {
    console.error('GET /api/auth/me:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function forgotPassword(req: Request, res: Response) {
  try {
    const body = readJson(req);
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const { email } = parsed.data;
    const user = await prisma.adminUser.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ success: true });
    }

    // Cooldown: a fresh code lives 15 min — if the current one was issued
    // less than a minute ago, don't send another (stops email bombing).
    if (user.resetCodeExp && user.resetCodeExp.getTime() > Date.now() + 14 * 60 * 1000) {
      return res.json({ success: true });
    }

    // crypto-strong code, stored hashed — a DB leak doesn't leak live codes.
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
    const exp = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.adminUser.update({
      where: { id: user.id },
      data: { resetCode: await bcrypt.hash(code, 10), resetCodeExp: exp, resetAttempts: 0 },
    });

    await sendResetCode(email, code);

    return res.json({ success: true });
  } catch (err) {
    console.error('[forgot-password] Error:', errMessage(err) || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const body = readJson(req);
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const { email, code, newPassword } = parsed.data;

    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user || !user.resetCode || !user.resetCodeExp) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    if (new Date() > new Date(user.resetCodeExp)) {
      return res.status(400).json({ error: 'Code has expired' });
    }

    const valid = await bcrypt.compare(code, user.resetCode);
    if (!valid) {
      // A 6-digit code is brute-forceable without a hard attempt cap:
      // after 5 wrong guesses the code dies and a new one must be requested.
      const { resetAttempts } = await prisma.adminUser.update({
        where: { id: user.id },
        data: { resetAttempts: { increment: 1 } },
        select: { resetAttempts: true },
      });
      if (resetAttempts >= 5) {
        await prisma.adminUser.update({
          where: { id: user.id },
          data: { resetCode: null, resetCodeExp: null, resetAttempts: 0 },
        });
        return res.status(400).json({ error: 'Invalid or expired code' });
      }
      return res.status(400).json({ error: 'Invalid code' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.adminUser.update({
      where: { id: user.id },
      data: { passwordHash, resetCode: null, resetCodeExp: null, resetAttempts: 0 },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('POST /api/auth/reset-password:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function setCookie(req: Request, res: Response) {
  // No try/catch around the body read, same as the JS: a bad body → empty 500.
  const { token } = readJson<{ token?: string }>(req);
  if (!token) {
    return res.status(400).json({ error: 'token required' });
  }

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, jwtSecret()));
  } catch {
    return res.status(400).json({ error: 'invalid token' });
  }

  // Only customer tokens may be installed here — an admin token must never
  // become a long-lived customer_session cookie.
  if (payload.type !== 'customer' || !(payload.clientId || payload.customerId)) {
    return res.status(400).json({ error: 'invalid token' });
  }

  res.cookie('customer_session', token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30 * 1000, // 30 days — matches the token's own expiry (Express maxAge is ms)
  });
  return res.json({ success: true });
}
