import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { createUserSchema } from '@/lib/validations';

const MANAGE_ROLES = ['admin', 'manager'];

export async function GET() {
  try {
    const auth = await requireRole(prisma, MANAGE_ROLES);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const users = await prisma.adminUser.findMany({
      select: { id: true, email: true, role: true, name: true, phone: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(users);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireRole(prisma, MANAGE_ROLES);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const { email, password, role, name, phone, isActive } = parsed.data;

    // Only an admin may create another admin — stop managers from escalating.
    if (role === 'admin' && auth.session.role !== 'admin') {
      return NextResponse.json({ error: 'Only an admin can assign the admin role' }, { status: 403 });
    }

    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.adminUser.create({
      data: { email, passwordHash, role, name: name ?? null, phone: phone ?? null, isActive },
      select: { id: true, email: true, role: true, name: true, phone: true, isActive: true, createdAt: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
