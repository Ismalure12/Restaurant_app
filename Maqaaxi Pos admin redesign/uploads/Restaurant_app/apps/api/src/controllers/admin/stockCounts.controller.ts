import type { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { readJson } from '../../utils/body.js';
import { isDayKey } from '../../lib/time/businessTime.js';
import { sendHttpError } from '../../lib/closing/dayClose.js';
import { startCount, countDetail, discardDraft, saveLines, postCount } from '../../lib/inventory/stockCount.js';
import { num, round2 } from '../../lib/reports/common.js';

// GET  /api/admin/stock-counts — recent stock counts (draft + posted). Manager.
// POST /api/admin/stock-counts — start a count sheet for every active item
//      ({ countedOn? } defaults to today), or return the draft already open.
const createCountSchema = z.object({ countedOn: z.string().refine(isDayKey, 'Date must look like 2026-09-30').optional() });

export async function listStockCounts(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'inventory', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    const rows = await prisma.stockCount.findMany({
      orderBy: [{ countedOn: 'desc' }, { id: 'desc' }], take: 60,
      select: { id: true, countedOn: true, status: true, totalValue: true, postedAt: true, _count: { select: { lines: true } } },
    });
    return res.json(rows.map((r) => ({
      id: r.id, countedOn: r.countedOn, status: r.status, postedAt: r.postedAt, items: r._count.lines,
      totalValue: r.totalValue == null ? null : round2(num(r.totalValue)),
    })));
  } catch (err) {
    console.error('GET /api/admin/stock-counts:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createStockCount(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'inventory', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = createCountSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  try {
    const r = await startCount(prisma, { countedOn: parsed.data.countedOn, userId: auth.session.userId ?? null });
    return res.status(r.created ? 201 : 200).json(r);
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error('POST /api/admin/stock-counts:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET    /api/admin/stock-counts/:id — the sheet: every item with system quantity,
//        counted quantity, difference, unit cost and value.
// PUT    /api/admin/stock-counts/:id — save counted quantities on a draft:
//        { lines: [{ itemId, countedQty | null }] }.
// DELETE /api/admin/stock-counts/:id — discard a draft. Manager tier.
const updateCountSchema = z.object({
  lines: z.array(z.object({
    itemId: z.number().int().positive(),
    countedQty: z.number().min(0, 'A counted quantity cannot be negative').max(1_000_000).nullable(),
  })).min(1).max(2000),
});
const parseId = (raw: string) => { const n = parseInt(raw, 10); return Number.isFinite(n) && n > 0 ? n : null; };

export async function getStockCount(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'inventory', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const detail = await countDetail(prisma, id);
    if (!detail) return res.status(404).json({ error: 'Stock count not found' });
    return res.json(detail);
  } catch (err) {
    console.error(`GET /api/admin/stock-counts/${id}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateStockCount(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'inventory', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = updateCountSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  try {
    await saveLines(prisma, id, parsed.data.lines);
    return res.json(await countDetail(prisma, id));
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error(`PUT /api/admin/stock-counts/${id}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteStockCount(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'inventory', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    await discardDraft(prisma, id, auth.session.userId ?? null);
    return res.json({ ok: true });
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error(`DELETE /api/admin/stock-counts/${id}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/admin/stock-counts/:id/post — post a fully counted sheet: each
// difference becomes an `adjustment` stock movement and the count's value
// (counted quantity × weighted-average cost) is fixed as the closing stock.
// Manager tier; audited.
export async function postStockCount(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'inventory', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
  try {
    const result = await postCount(prisma, id, auth.session.userId ?? null);
    // The count is already posted — a failure building the summary must not look like a failed post.
    const count = await countDetail(prisma, id).catch((err) => { console.error(`stock-counts/${id}: posted, but the summary failed:`, err); return null; });
    // `items` is a plain number for the confirmation line; `count` is the full posted sheet.
    return res.json({ ...result, items: count?.total ?? 0, count });
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error(`POST /api/admin/stock-counts/${id}/post:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
