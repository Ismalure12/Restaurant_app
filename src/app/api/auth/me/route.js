import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let role = session.role;

    // Fetch role from DB if missing from older JWTs
    if (!role) {
      const user = await prisma.adminUser.findUnique({
        where: { id: session.userId },
        select: { role: true },
      });
      role = user?.role || 'user';
    }

    return NextResponse.json({
      userId: session.userId,
      email: session.email,
      role,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
