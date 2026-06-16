import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { updateUserSchema } from '@/lib/validations';

const MANAGE_ROLES = ['admin', 'manager'];

export async function PUT(request, { params }) {
  try {
    const auth = await requireRole(prisma, MANAGE_ROLES);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const userId = parseInt(id);
    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // Only an admin may promote a user to admin — stop managers from escalating.
    if (parsed.data.role === 'admin' && auth.session.role !== 'admin') {
      return NextResponse.json({ error: 'Only an admin can assign the admin role' }, { status: 403 });
    }

    if (parsed.data.email) {
      const existing = await prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
      if (existing && existing.id !== userId) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }
    }

    const user = await prisma.adminUser.update({
      where: { id: userId },
      data: parsed.data,
      select: { id: true, email: true, role: true, name: true, phone: true, isActive: true, createdAt: true },
    });

    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireRole(prisma, MANAGE_ROLES);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const userId = parseInt(id);

    if (auth.session.userId === userId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    await prisma.adminUser.delete({ where: { id: userId } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
