import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { menuItemSchema } from '@/lib/validations';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');

    const where = {};
    const onlyActive = searchParams.get('onlyActive');
    if (onlyActive !== 'false') where.isActive = true;
    if (categoryId) where.categoryId = parseInt(categoryId);

    const items = await prisma.menuItem.findMany({
      where,
      include: {
        category: true,
        optionGroups: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
        extras: { orderBy: { sortOrder: 'asc' } },
        tags: { include: { tag: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('menu-items GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = menuItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const item = await prisma.menuItem.create({
      data: parsed.data,
      include: {
        category: true,
        optionGroups: { include: { options: true } },
        extras: true,
        tags: { include: { tag: true } },
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('menu-items POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
