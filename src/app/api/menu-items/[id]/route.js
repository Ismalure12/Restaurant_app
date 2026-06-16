import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { menuItemSchema, itemTagsSchema } from '@/lib/validations';

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const item = await prisma.menuItem.findUnique({
      where: { id: parseInt(id) },
      include: {
        category: true,
        optionGroups: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
        extras: { orderBy: { sortOrder: 'asc' } },
        tags: { include: { tag: true } },
      },
    });
    if (!item) return NextResponse.json({ error: 'Menu item not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    console.error('menu-items GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    // Optional tagIds replacement on the same payload
    let tagIds = null;
    if (Array.isArray(body.tagIds)) {
      const parsedTags = itemTagsSchema.safeParse({ tagIds: body.tagIds });
      if (!parsedTags.success) {
        return NextResponse.json({ error: 'Invalid tagIds', details: parsedTags.error.flatten() }, { status: 400 });
      }
      tagIds = parsedTags.data.tagIds;
      delete body.tagIds;
    }

    const parsed = menuItemSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const menuItemId = parseInt(id);

    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.menuItem.update({
        where: { id: menuItemId },
        data: parsed.data,
      });
      if (tagIds !== null) {
        await tx.itemTag.deleteMany({ where: { menuItemId } });
        if (tagIds.length) {
          await tx.itemTag.createMany({
            data: tagIds.map((tagId) => ({ menuItemId, tagId })),
          });
        }
      }
      return tx.menuItem.findUnique({
        where: { id: menuItemId },
        include: {
          category: true,
          optionGroups: { include: { options: true } },
          extras: true,
          tags: { include: { tag: true } },
        },
      });
    });

    return NextResponse.json(item);
  } catch (error) {
    if (error.code === 'P2025') return NextResponse.json({ error: 'Menu item not found' }, { status: 404 });
    console.error('menu-items PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await prisma.menuItem.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('menu-items DELETE error:', error);
    if (error.code === 'P2025') return NextResponse.json({ error: 'Menu item not found' }, { status: 404 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
