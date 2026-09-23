import type { Request, Response } from 'express';
import prisma from '../lib/db/prisma.js';

// GET /api/menu — everything the public menu needs, in one response.
// Public (no auth): it is the customer-facing menu. Only ACTIVE categories
// and items are returned, and prices are plain numbers (Prisma
// Decimals are converted here so the web app never sees them).
//
// This used to be a direct Prisma query inside the Next page; it moved here so
// the web app has no database access at all.
const num = (d: unknown) => (d == null ? null : Number(String(d)));

export async function getMenu(_req: Request, res: Response) {
  try {
    const [categories, socialLinks] = await Promise.all([
      prisma.category.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: {
              optionGroups: {
                orderBy: { sortOrder: 'asc' },
                include: { options: { orderBy: { sortOrder: 'asc' } } },
              },
              extras: { orderBy: { sortOrder: 'asc' } },
              tags: { include: { tag: true } },
            },
          },
        },
      }),
      prisma.socialLink.findMany({ orderBy: { createdAt: 'asc' } }),
    ]);

    // Menu data changes rarely; let browsers reuse it briefly on repeat scans.
    res.set('Cache-Control', 'public, max-age=60');
    return res.json({
      categories: categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        kicker: c.kicker,
        headline: c.headline,
        sub: c.sub,
        coverUrl: c.coverUrl,
        items: c.items.map((it) => ({
          id: it.id,
          name: it.name,
          description: it.description,
          price: num(it.price),
          imageUrl: it.imageUrl,
          kcal: it.kcal,
          prepTime: it.prepTime,
          pairing: it.pairing,
          optionGroups: it.optionGroups.map((g) => ({
            id: g.id,
            title: g.title,
            options: g.options.map((o) => ({ id: o.id, name: o.name, priceAdd: num(o.priceAdd) })),
          })),
          extras: it.extras.map((e) => ({ id: e.id, name: e.name, priceAdd: num(e.priceAdd) })),
          tags: it.tags.map((t) => ({ id: t.tag.id, slug: t.tag.slug, label: t.tag.label, variant: t.tag.variant })),
        })),
      })),
      socialLinks: socialLinks.map((l) => ({ platform: l.platform, value: l.value })),
    });
  } catch (err) {
    console.error('GET /api/menu:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
