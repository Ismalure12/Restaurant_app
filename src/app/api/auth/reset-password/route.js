import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { resetPasswordSchema } from '@/lib/validations';

export async function POST(request) {
  try {
    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const { email, code, newPassword } = parsed.data;

    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user || !user.resetCode || !user.resetCodeExp) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
    }

    if (user.resetCode !== code) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }

    if (new Date() > new Date(user.resetCodeExp)) {
      return NextResponse.json({ error: 'Code has expired' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.adminUser.update({
      where: { id: user.id },
      data: { passwordHash, resetCode: null, resetCodeExp: null },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
