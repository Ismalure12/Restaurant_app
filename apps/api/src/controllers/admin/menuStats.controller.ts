import type { Request, Response } from 'express';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { neverSoldQuerySchema } from '../../validations/catalog.validation.js';
import { searchParams } from '../../utils/query.js';
import { rangeFromQuery } from '../../lib/time/businessTime.js';
import { menuReport } from '../../lib/reports/menu.js';

// GET /api/admin/menu-items/never-sold?days=30 — the Menu items page's "Never
// sold · 30 days" KPI: active dishes with no line in a closed (not voided) sale
// in the last N business days, ending today. Same rule and code as the Menu
// report's never-sold list (lib/reports/menu.ts), so the two always agree.
// Anyone who may view the Menu page; returns ids only (names are already on
// that page).
export async function getNeverSold(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'menu', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const q = searchParams(req);
  const parsed = neverSoldQuerySchema.safeParse({ days: q.get('days') ?? undefined });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });

  const r = rangeFromQuery(null, null, { defaultDays: parsed.data.days });
  if (!r.range) return res.status(400).json({ error: r.error });

  try {
    const { neverSold, from, to, days } = await menuReport(prisma, r.range);
    return res.json({ days, from, to, count: neverSold.length, ids: neverSold.map((d) => d.id) });
  } catch (err) {
    console.error('GET /api/admin/menu-items/never-sold:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
