import type { Request, Response } from 'express';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { optionGroupSchema } from '../../validations/catalog.validation.js';
import { readJson } from '../../utils/body.js';
import { searchParams as getSearchParams } from '../../utils/query.js';
import { errCode } from '../../utils/errors.js';

export async function listOptionGroups(req: Request, res: Response) {
  try {
    const searchParams = getSearchParams(req);
    const menuItemId = searchParams.get('menuItemId');
    if (!menuItemId) return res.status(400).json({ error: 'menuItemId is required' });

    const groups = await prisma.optionGroup.findMany({
      where: { menuItemId: parseInt(menuItemId) },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    return res.json(groups);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createOptionGroup(req: Request, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'menu', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const body = readJson(req);
    const parsed = optionGroupSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const group = await prisma.optionGroup.create({
      data: parsed.data,
      include: { options: true },
    });
    return res.status(201).json(group);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateOptionGroup(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'menu', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { id } = req.params;
    const body = readJson(req);
    const parsed = optionGroupSchema.partial().safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const group = await prisma.optionGroup.update({
      where: { id: parseInt(id) },
      data: parsed.data,
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
    return res.json(group);
  } catch (error) {
    if (errCode(error) === 'P2025') return res.status(404).json({ error: 'Not found' });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteOptionGroup(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'menu', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { id } = req.params;
    await prisma.optionGroup.delete({ where: { id: parseInt(id) } });
    return res.json({ success: true });
  } catch (error) {
    if (errCode(error) === 'P2025') return res.status(404).json({ error: 'Not found' });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
