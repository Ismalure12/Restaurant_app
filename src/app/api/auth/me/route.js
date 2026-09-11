import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';

// Who is signed in. The display name isn't in the JWT (and older tokens may
// lack a role), so one lookup fills both — receipts and the sidebar print the
// person's name, never their login email.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.adminUser.findUnique({
      where: { id: session.userId },
      select: { name: true, role: true },
    });

    return NextResponse.json({
      userId: session.userId,
      email: session.email,
      role: session.role || user?.role || 'user',
      name: user?.name?.trim() || null,
    });
  } catch (err) {
    console.error('GET /api/auth/me:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
