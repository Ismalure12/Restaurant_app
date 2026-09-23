import type { Request, Response } from 'express';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { categorySchema } from '../../validations/catalog.validation.js';
import { slugify } from '../../utils/slug.js';
import { readJson } from '../../utils/body.js';
import { errCode } from '../../utils/errors.js';

export async function listCategories(_req: Request, res: Response) {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { items: true } } },
    });
    return res.json(categories);
  } catch (error) {
    console.error('categories GET error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createCategory(req: Request, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'categories', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const body = readJson(req);
    const parsed = categorySchema.safeParse(body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const data = parsed.data;
    const slug = slugify(data.name);

    const category = await prisma.category.create({
      data: { ...data, slug },
    });

    return res.status(201).json(category);
  } catch (error) {
    console.error('categories POST error:', error);
    if (errCode(error) === 'P2002') {
      return res.status(409).json({ error: 'Category slug already exists' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateCategory(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'categories', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { id } = req.params;
    const body = readJson(req);
    const parsed = categorySchema.partial().safeParse(body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    // Keep the slug in sync when the name changes — POST derives it from name.
    const data = parsed.data.name
      ? { ...parsed.data, slug: slugify(parsed.data.name) }
      : parsed.data;

    const category = await prisma.category.update({
      where: { id: parseInt(id) },
      data,
    });

    return res.json(category);
  } catch (error) {
    console.error('Error updating category:', error);
    if (errCode(error) === 'P2025') {
      return res.status(404).json({ error: 'Category not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteCategory(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'categories', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { id } = req.params;

    await prisma.category.delete({
      where: { id: parseInt(id) },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('categories DELETE error:', error);
    if (errCode(error) === 'P2025') {
      return res.status(404).json({ error: 'Category not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
