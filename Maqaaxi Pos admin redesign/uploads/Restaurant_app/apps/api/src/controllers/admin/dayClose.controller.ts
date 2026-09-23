import type { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { dayKey, isDayKey } from '../../lib/time/businessTime.js';
import { unclosedDays, closeDay, dayPreview, sendHttpError, reopenDay } from '../../lib/closing/dayClose.js';
import { searchParams } from '../../utils/query.js';
import { num, round2 } from '../../lib/reports/common.js';
import { readJson } from '../../utils/body.js';

// GET /api/admin/day-close — the day-close overview: which ended days still
// need closing (oldest first) and the archive of closed days (Reports › Day
// closes). Manager tier.
const CAP = 60;

export async function listDayCloses(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, ['cash', 'reports'], 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const cursor = searchParams(req).get('cursor');
  try {
    const today = dayKey(new Date());
    const [unclosed, rows] = await Promise.all([
      unclosedDays(prisma, today),
      prisma.dayClose.findMany({
        where: { isClosed: true, ...(cursor ? { businessDay: { lt: cursor } } : {}) },
        orderBy: { businessDay: 'desc' },
        take: CAP + 1,
        select: {
          businessDay: true, closedAt: true, closedBy: { select: { name: true, email: true } }, snapshot: true,
          lines: { select: { expected: true, counted: true } },
        },
      }),
    ]);
    const page = rows.slice(0, CAP);
    return res.json({
      today,
      openingDate: unclosed.openingDate,
      unclosed: unclosed.days,
      closed: page.map((r) => {
        const snap = (r.snapshot ?? {}) as { sales?: { net?: number; count?: number } };
        return {
          day: r.businessDay,
          closedAt: r.closedAt,
          closedBy: r.closedBy ? r.closedBy.name?.trim() || r.closedBy.email : null,
          sales: snap.sales?.count ?? 0,
          net: snap.sales?.net ?? 0,
          difference: round2(r.lines.reduce((s, l) => s + (l.counted == null ? 0 : num(l.counted) - num(l.expected)), 0)),
        };
      }),
      nextCursor: rows.length > CAP ? page[page.length - 1].businessDay : null,
    });
  } catch (err) {
    console.error('GET /api/admin/day-close:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET  /api/admin/day-close/:day — the Day close screen for one business day:
//      the checks, the Z-report (sales, collections per person, voids) and the
//      per-account opening → in → out → expected lines. A closed day returns
//      its frozen snapshot.
// POST /api/admin/day-close/:day — close it: { counted: [{accountId, amount}],
//      carryOver? }. Locks the day; differences become over_short rows.
// Manager tier; every close is audited.
const closeSchema = z.object({
  counted: z.array(z.object({
    accountId: z.number().int().positive(),
    amount: z.number().min(0, 'A counted amount cannot be negative').max(100_000_000),
  })).max(50),
  carryOver: z.boolean().optional(),
});

export async function getDayClose(req: Request<{ day: string }>, res: Response) {
  const auth = await requirePage(prisma, req, ['cash', 'reports'], 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!isDayKey(req.params.day)) return res.status(400).json({ error: 'day must be a date like 2026-09-19' });
  try {
    return res.json(await dayPreview(prisma, req.params.day, dayKey(new Date())));
  } catch (err) {
    console.error(`GET /api/admin/day-close/${req.params.day}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function closeBusinessDay(req: Request<{ day: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'cash', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!isDayKey(req.params.day)) return res.status(400).json({ error: 'day must be a date like 2026-09-19' });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = closeSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  const ids = parsed.data.counted.map((c) => c.accountId);
  if (new Set(ids).size !== ids.length) return res.status(400).json({ error: 'An account is counted twice' });
  try {
    const result = await closeDay(prisma, { day: req.params.day, counted: parsed.data.counted, carryOver: parsed.data.carryOver, userId: auth.session.userId ?? null });
    return res.status(201).json(result);
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error(`POST /api/admin/day-close/${req.params.day}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/admin/day-close/:day/reopen — a manager reopens a closed day with
// a reason (audited). Newest closed day first; the over/short rows of the
// close are reversed, never deleted.
const schema = z.object({ reason: z.string().trim().min(3, 'Give a reason for reopening the day').max(300) });

export async function reopenBusinessDay(req: Request<{ day: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'cash', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!isDayKey(req.params.day)) return res.status(400).json({ error: 'day must be a date like 2026-09-19' });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  try {
    await reopenDay(prisma, { day: req.params.day, reason: parsed.data.reason, userId: auth.session.userId ?? null });
    return res.json(await dayPreview(prisma, req.params.day, dayKey(new Date())));
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error(`POST /api/admin/day-close/${req.params.day}/reopen:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
