import type { Request, Response } from 'express';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { socialLinkSchema, updateSocialLinkSchema } from '../../validations/catalog.validation.js';
import { readJson } from '../../utils/body.js';

// Public — anyone can read social links
export async function listSocialLinks(_req: Request, res: Response) {
  try {
    const links = await prisma.socialLink.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return res.json(links);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Manager tier — create a social link
export async function createSocialLink(req: Request, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'settings', 'act');
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const body = readJson(req);
    const parsed = socialLinkSchema.safeParse(body);

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }

    const { platform, value } = parsed.data;

    const existing = await prisma.socialLink.findUnique({ where: { platform } });
    if (existing) {
      return res.status(409).json({ error: `${platform} already exists. Use PUT to update.` });
    }

    const link = await prisma.socialLink.create({
      data: { platform, value },
    });

    return res.status(201).json(link);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Admin-only — update a social link
export async function updateSocialLink(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'settings', 'act');
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const { id } = req.params;
    const body = readJson(req);
    const parsed = updateSocialLinkSchema.safeParse(body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const link = await prisma.socialLink.update({
      where: { id: parseInt(id) },
      data: { value: parsed.data.value },
    });

    return res.json(link);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Admin-only — delete a social link
export async function deleteSocialLink(req: Request<{ id: string }>, res: Response) {
  try {
    const auth = await requirePage(prisma, req, 'settings', 'act');
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const { id } = req.params;

    await prisma.socialLink.delete({ where: { id: parseInt(id) } });

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
