import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole, CATALOG_ROLES } from '@/lib/auth';
import { optionGroupSchema } from '@/lib/validations';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const menuItemId = searchParams.get('menuItemId');
    if (!menuItemId) return NextResponse.json({ error: 'menuItemId is required' }, { status: 400 });

    const groups = await prisma.optionGroup.findMany({
      where: { menuItemId: parseInt(menuItemId) },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    return NextResponse.json(groups);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireRole(prisma, CATALOG_ROLES);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const parsed = optionGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }
    const group = await prisma.optionGroup.create({
      data: parsed.data,
      include: { options: true },
    });
    return NextResponse.json(group, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
