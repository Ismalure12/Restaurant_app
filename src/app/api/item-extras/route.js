import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { itemExtraSchema } from '@/lib/validations';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const menuItemId = searchParams.get('menuItemId');
    if (!menuItemId) return NextResponse.json({ error: 'menuItemId is required' }, { status: 400 });
    const extras = await prisma.itemExtra.findMany({
      where: { menuItemId: parseInt(menuItemId) },
      orderBy: { sortOrder: 'asc' },
    });
    return NextResponse.json(extras);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const parsed = itemExtraSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }
    const extra = await prisma.itemExtra.create({ data: parsed.data });
    return NextResponse.json(extra, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
