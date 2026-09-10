import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { forgotPasswordSchema } from '@/lib/validations';
import { sendResetCode } from '@/lib/email';

export async function POST(request) {
  try {
    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const { email } = parsed.data;
    const user = await prisma.adminUser.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // Cooldown: a fresh code lives 15 min — if the current one was issued
    // less than a minute ago, don't send another (stops email bombing).
    if (user.resetCodeExp && user.resetCodeExp.getTime() > Date.now() + 14 * 60 * 1000) {
      return NextResponse.json({ success: true });
    }

    // crypto-strong code, stored hashed — a DB leak doesn't leak live codes.
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
    const exp = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.adminUser.update({
      where: { id: user.id },
      data: { resetCode: await bcrypt.hash(code, 10), resetCodeExp: exp, resetAttempts: 0 },
    });

    await sendResetCode(email, code);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[forgot-password] Error:', err.message || err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
