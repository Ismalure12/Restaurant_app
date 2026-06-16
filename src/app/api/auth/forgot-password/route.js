import { NextResponse } from 'next/server';
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

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const exp = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.adminUser.update({
      where: { id: user.id },
      data: { resetCode: code, resetCodeExp: exp },
    });

    await sendResetCode(email, code);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[forgot-password] Error:', err.message || err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
