import type { Request, Response } from 'express';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { itemExtraSchema } from '../../validations/catalog.validation.js';
import { readJson } from '../../utils/body.js';
import { searchParams as getSearchParams } from '../../utils/query.js';
import { errCode } from '../../utils/errors.js';

export async function listItemExtras(req: Request, res: Response) {
  try {
    const searchParams = getSearchParams(req);
    const menuItemId = searchParams.get('menuItemId');
    if (!menuItemId) return res.status(400).json({ error: 'menuItemId is required' });
    const extras = await prisma.itemExtra.findMany({
      where: { menuItemId: parseInt(menuItemId) },
      orderBy: { sortOrder: 'asc' },
    });
    return res.json(extras);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createItemExtra(req: Request, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'menu', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const body = readJson(req);
    const parsed = itemExtraSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const extra = await prisma.itemExtra.create({ data: parsed.data });
    return res.status(201).json(extra);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateItemExtra(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'menu', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { id } = req.params;
    const body = readJson(req);
    const parsed = itemExtraSchema.partial().safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const extra = await prisma.itemExtra.update({
      where: { id: parseInt(id) },
      data: parsed.data,
    });
    return res.json(extra);
  } catch (error) {
    if (errCode(error) === 'P2025') return res.status(404).json({ error: 'Not found' });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteItemExtra(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'menu', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { id } = req.params;
    await prisma.itemExtra.delete({ where: { id: parseInt(id) } });
    return res.json({ success: true });
  } catch (error) {
    if (errCode(error) === 'P2025') return res.status(404).json({ error: 'Not found' });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
