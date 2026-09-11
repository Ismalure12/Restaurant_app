import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole, CATALOG_ROLES } from '@/lib/auth';
import { categorySchema } from '@/lib/validations';
import { slugify } from '@/lib/slug';

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { items: true } } },
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.error('categories GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireRole(prisma, CATALOG_ROLES);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const parsed = categorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const slug = slugify(data.name);

    const category = await prisma.category.create({
      data: { ...data, slug },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error('categories POST error:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Category slug already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
