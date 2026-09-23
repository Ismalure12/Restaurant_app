import type { Request, Response } from 'express';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { tagSchema } from '../../validations/catalog.validation.js';
import { readJson } from '../../utils/body.js';
import { errCode } from '../../utils/errors.js';

export async function listTags(_req: Request, res: Response) {
  try {
    const tags = await prisma.tag.findMany({ orderBy: { label: 'asc' } });
    return res.json(tags);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createTag(req: Request, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'tags', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const body = readJson(req);
    const parsed = tagSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const tag = await prisma.tag.create({ data: parsed.data });
    return res.status(201).json(tag);
  } catch (error) {
    if (errCode(error) === 'P2002') return res.status(409).json({ error: 'Tag slug already exists' });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateTag(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'tags', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { id } = req.params;
    const body = readJson(req);
    const parsed = tagSchema.partial().safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const tag = await prisma.tag.update({ where: { id: parseInt(id) }, data: parsed.data });
    return res.json(tag);
  } catch (error) {
    if (errCode(error) === 'P2025') return res.status(404).json({ error: 'Not found' });
    if (errCode(error) === 'P2002') return res.status(409).json({ error: 'Tag slug already exists' });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteTag(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'tags', 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { id } = req.params;
    await prisma.tag.delete({ where: { id: parseInt(id) } });
    return res.json({ success: true });
  } catch (error) {
    if (errCode(error) === 'P2025') return res.status(404).json({ error: 'Not found' });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
