import type { Request, Response } from 'express';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { itemOptionSchema } from '../../validations/catalog.validation.js';
import { readJson } from '../../utils/body.js';
import { errCode } from '../../utils/errors.js';

export async function createItemOption(req: Request, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'menu', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const body = readJson(req);
    const parsed = itemOptionSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const opt = await prisma.itemOption.create({ data: parsed.data });
    return res.status(201).json(opt);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateItemOption(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'menu', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { id } = req.params;
    const body = readJson(req);
    const parsed = itemOptionSchema.partial().safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const opt = await prisma.itemOption.update({
      where: { id: parseInt(id) },
      data: parsed.data,
    });
    return res.json(opt);
  } catch (error) {
    if (errCode(error) === 'P2025') return res.status(404).json({ error: 'Not found' });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteItemOption(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'menu', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { id } = req.params;
    await prisma.itemOption.delete({ where: { id: parseInt(id) } });
    return res.json({ success: true });
  } catch (error) {
    if (errCode(error) === 'P2025') return res.status(404).json({ error: 'Not found' });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
