import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { menuItemSchema, itemTagsSchema } from '../../validations/catalog.validation.js';
import { readJson } from '../../utils/body.js';
import { searchParams as getSearchParams } from '../../utils/query.js';
import { errCode } from '../../utils/errors.js';

export async function listMenuItems(req: Request, res: Response) {
  try {
    const searchParams = getSearchParams(req);
    const categoryId = searchParams.get('categoryId');

    const where: Prisma.MenuItemWhereInput = {};
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

    return res.json(items);
  } catch (error) {
    console.error('menu-items GET error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createMenuItem(req: Request, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'menu', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const body = readJson(req);
    const parsed = menuItemSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
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

    return res.status(201).json(item);
  } catch (error) {
    console.error('menu-items POST error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getMenuItem(req: Request<{ id: string }>, res: Response) {
  try {
    const { id } = req.params;
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
    if (!item) return res.status(404).json({ error: 'Menu item not found' });
    return res.json(item);
  } catch (error) {
    console.error('menu-items GET error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateMenuItem(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'menu', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { id } = req.params;
    const body = readJson(req);

    // Optional tagIds replacement on the same payload
    let tagIds: number[] | null = null;
    if (Array.isArray(body.tagIds)) {
      const parsedTags = itemTagsSchema.safeParse({ tagIds: body.tagIds });
      if (!parsedTags.success) {
        return res.status(400).json({ error: 'Invalid tagIds', details: parsedTags.error.flatten() });
      }
      tagIds = parsedTags.data.tagIds;
      delete body.tagIds;
    }

    const parsed = menuItemSchema.partial().safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
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

    return res.json(item);
  } catch (error) {
    if (errCode(error) === 'P2025') return res.status(404).json({ error: 'Menu item not found' });
    console.error('menu-items PUT error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteMenuItem(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'menu', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { id } = req.params;
    await prisma.menuItem.delete({ where: { id: parseInt(id) } });
    return res.json({ success: true });
  } catch (error) {
    console.error('menu-items DELETE error:', error);
    if (errCode(error) === 'P2025') return res.status(404).json({ error: 'Menu item not found' });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
