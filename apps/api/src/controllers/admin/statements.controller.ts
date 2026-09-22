import type { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { monthList, closeMonth, monthPreview, reopenMonth } from '../../lib/closing/periodClose.js';
import { sendHttpError } from '../../lib/closing/dayClose.js';
import { MONTH_RE, monthRange } from '../../lib/closing/statements.js';
import { readJson } from '../../utils/body.js';
import { yearList, FY_RE, closeYear, yearPreview, reopenYear, fyMonths } from '../../lib/closing/yearClose.js';
import { searchParams } from '../../utils/query.js';
import { env } from '../../config/env.js';
import { readCalendar } from '../../lib/money/moneyReads.js';
import { getOrderPrefix, formatOrderCode } from '../../lib/orders/orderCode.js';
import { LEDGER_CSV_HEADER, LEDGER_ORDER, LEDGER_SELECT, ledgerCsvRow, ledgerRow } from '../../lib/reports/sales.js';
import { localStamp, num, round2, salesWhere, sendCsv } from '../../lib/reports/common.js';

// GET /api/admin/statements/months — the months from the opening month to now
// and whether each is closed / open (ended, not closed) / running. Manager.
export async function listMonthStatements(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    return res.json(await monthList(prisma));
  } catch (err) {
    console.error('GET /api/admin/statements/months:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET  /api/admin/statements/month/:month — the month's statements: profit &
//      loss (with cost of goods), cash flow per account and the business
//      position. Live for an open month (with what still blocks closing it),
//      the frozen copy for a closed one. Manager tier.
// POST /api/admin/statements/month/:month — close the month (locks its days).
export async function getMonthStatement(req: Request<{ month: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!MONTH_RE.test(req.params.month)) return res.status(400).json({ error: 'Month must look like 2026-09' });
  try {
    return res.json(await monthPreview(prisma, req.params.month));
  } catch (err) {
    console.error(`GET /api/admin/statements/month/${req.params.month}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function closeMonthStatement(req: Request<{ month: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!MONTH_RE.test(req.params.month)) return res.status(400).json({ error: 'Month must look like 2026-09' });
  try {
    return res.status(201).json(await closeMonth(prisma, { month: req.params.month, userId: auth.session.userId ?? null }));
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error(`POST /api/admin/statements/month/${req.params.month}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/admin/statements/month/:month/reopen — reopen the newest closed
// month with a reason (audited). Its days unlock; the frozen statements are
// replaced when it is closed again. Manager tier.
const reopenMonthSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason for reopening the month').max(300) });

export async function reopenMonthStatement(req: Request<{ month: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!MONTH_RE.test(req.params.month)) return res.status(400).json({ error: 'Month must look like 2026-09' });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = reopenMonthSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  try {
    return res.json(await reopenMonth(prisma, { month: req.params.month, reason: parsed.data.reason, userId: auth.session.userId ?? null }));
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error(`POST /api/admin/statements/month/${req.params.month}/reopen:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/statements/years — the financial years from the opening one
// to the current one, and whether each is closed / open / running. Manager.
export async function listYearStatements(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    return res.json(await yearList(prisma));
  } catch (err) {
    console.error('GET /api/admin/statements/years:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET  /api/admin/statements/year/:fy (FY2026) — the annual statements: P&L
//      with a column per month and a total, cash flow per account for the year,
//      the position at year end and the owner summary. Built from the closed
//      months; frozen once the year is closed. Manager tier.
// POST /api/admin/statements/year/:fy — close the year (every month must be
//      closed first). Locks the year.
const fyOf = (raw: string) => { const m = FY_RE.exec(raw); return m ? Number(m[1]) : null; };

export async function getYearStatement(req: Request<{ fy: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const fy = fyOf(req.params.fy);
  if (fy == null) return res.status(400).json({ error: 'Year must look like FY2026' });
  try {
    return res.json(await yearPreview(prisma, fy));
  } catch (err) {
    console.error(`GET /api/admin/statements/year/${req.params.fy}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function closeYearStatement(req: Request<{ fy: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const fy = fyOf(req.params.fy);
  if (fy == null) return res.status(400).json({ error: 'Year must look like FY2026' });
  try {
    return res.status(201).json(await closeYear(prisma, { fy, userId: auth.session.userId ?? null }));
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error(`POST /api/admin/statements/year/${req.params.fy}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/admin/statements/year/:fy/reopen — reopen the newest closed year
// with a reason (audited). Its months stay closed. Manager tier.
const reopenYearSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason for reopening the year').max(300) });

export async function reopenYearStatement(req: Request<{ fy: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const m = FY_RE.exec(req.params.fy);
  if (!m) return res.status(400).json({ error: 'Year must look like FY2026' });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = reopenYearSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  try {
    return res.json(await reopenYear(prisma, { fy: Number(m[1]), reason: parsed.data.reason, userId: auth.session.userId ?? null }));
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error(`POST /api/admin/statements/year/${req.params.fy}/reopen:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/statements/year/:fy/export?dataset=sales|cashbook|expenses|payroll|stockcounts
// — the year pack for the accountant or tax office: one CSV per dataset over
// the financial year (from the opening month on). The statements themselves
// print from the page (PDF). Manager tier; each dataset is streamed in bounded
// batches.
const BATCH = 2000;
const DATASETS = ['sales', 'cashbook', 'expenses', 'payroll', 'stockcounts'] as const;
type Dataset = (typeof DATASETS)[number];
const money = (n: unknown) => round2(num(n)).toFixed(2);

export async function exportYearStatement(req: Request<{ fy: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'reports', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const m = FY_RE.exec(req.params.fy);
  if (!m) return res.status(400).json({ error: 'Year must look like FY2026' });
  const dataset = searchParams(req).get('dataset') as Dataset | null;
  if (!dataset || !DATASETS.includes(dataset)) return res.status(400).json({ error: `dataset must be one of: ${DATASETS.join(', ')}` });

  try {
    const cal = await readCalendar(prisma);
    if (!cal.openingDate) return res.status(409).json({ error: 'Set the opening balances first' });
    const months = fyMonths(Number(m[1]), cal.fiscalYearStartMonth).filter((x) => x >= cal.openingDate!.slice(0, 7));
    if (!months.length) return res.status(409).json({ error: 'That year is before the opening date' });
    const first = monthRange(months[0]);
    const last = monthRange(months[months.length - 1]);
    const range = { fromKey: first.first, toKey: last.last, from: first.from, to: last.to, days: 0 };
    const tag = `${req.params.fy}_${dataset}`;

    switch (dataset) {
      case 'sales': {
        const prefix = await getOrderPrefix(prisma);
        const rows: unknown[][] = [];
        let cursor: number | undefined;
        for (;;) {
          const batch = await prisma.order.findMany({
            where: salesWhere(range), select: LEDGER_SELECT, orderBy: LEDGER_ORDER, take: BATCH, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          });
          rows.push(...batch.map((o) => ledgerCsvRow(ledgerRow(o, prefix))));
          if (batch.length < BATCH) break;
          cursor = batch[batch.length - 1].id;
        }
        return sendCsv(res, `${tag}.csv`, LEDGER_CSV_HEADER, rows);
      }
      case 'cashbook': {
        const prefix = await getOrderPrefix(prisma);
        const rows: unknown[][] = [];
        let cursor: number | undefined;
        for (;;) {
          const batch = await prisma.accountEntry.findMany({
            where: { businessDay: { gte: first.first, lte: last.last } },
            orderBy: { id: 'asc' }, take: BATCH, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: { id: true, businessDay: true, occurredAt: true, kind: true, amount: true, note: true, account: { select: { label: true } }, order: { select: { id: true, createdAt: true } }, collectedBy: { select: { name: true, email: true } } },
          });
          rows.push(...batch.map((e) => [e.businessDay, localStamp(e.occurredAt, env.BUSINESS_TZ), e.account.label, e.kind, money(e.amount), e.order ? formatOrderCode(e.order, prefix) : '', e.collectedBy ? e.collectedBy.name?.trim() || e.collectedBy.email : '', e.note ?? '']));
          if (batch.length < BATCH) break;
          cursor = batch[batch.length - 1].id;
        }
        return sendCsv(res, `${tag}.csv`, ['Day', 'Time (local)', 'Account', 'Kind', 'Amount', 'Order ID', 'Collected by', 'Note'], rows);
      }
      case 'expenses': {
        const rows: unknown[][] = [];
        let cursor: number | undefined;
        for (;;) {
          const batch = await prisma.expense.findMany({
            where: { incurredAt: { gte: first.from, lt: last.to } }, orderBy: { id: 'asc' }, take: BATCH, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: { id: true, incurredAt: true, category: true, amount: true, note: true, paidFrom: { select: { label: true } } },
          });
          rows.push(...batch.map((e) => [localStamp(e.incurredAt, env.BUSINESS_TZ), e.category, money(e.amount), e.paidFrom?.label ?? '', e.note ?? '']));
          if (batch.length < BATCH) break;
          cursor = batch[batch.length - 1].id;
        }
        return sendCsv(res, `${tag}.csv`, ['Date (local)', 'Category', 'Amount', 'Paid from', 'Note'], rows);
      }
      case 'payroll': {
        const rows = await prisma.salaryPayment.findMany({
          where: { month: { in: months } }, orderBy: [{ month: 'asc' }, { id: 'asc' }], take: 5000,
          select: { month: true, amount: true, paidAt: true, note: true, staff: { select: { name: true, email: true } } },
        });
        return sendCsv(res, `${tag}.csv`, ['Month', 'Staff', 'Amount', 'Paid on (local)', 'Note'],
          rows.map((p) => [p.month, p.staff.name?.trim() || p.staff.email, money(p.amount), localStamp(p.paidAt, env.BUSINESS_TZ), p.note ?? '']));
      }
      case 'stockcounts': {
        const counts = await prisma.stockCount.findMany({
          where: { status: 'posted', countedOn: { gte: first.first, lte: last.last } }, orderBy: [{ countedOn: 'asc' }, { id: 'asc' }], take: 400,
          select: { countedOn: true, lines: { select: { itemId: true, systemQty: true, countedQty: true, unitCost: true } } },
        });
        const ids = [...new Set(counts.flatMap((c) => c.lines.map((l) => l.itemId)))];
        const items = ids.length ? await prisma.inventoryItem.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, unit: true } }) : [];
        const byId = new Map(items.map((i) => [i.id, i]));
        const rows = counts.flatMap((c) => c.lines.map((l) => {
          const counted = num(l.countedQty);
          const cost = l.unitCost == null ? null : num(l.unitCost);
          return [c.countedOn, byId.get(l.itemId)?.name ?? `Item ${l.itemId}`, byId.get(l.itemId)?.unit ?? '', num(l.systemQty), counted, cost == null ? '' : cost.toFixed(4), cost == null ? '' : money(counted * cost)];
        }));
        return sendCsv(res, `${tag}.csv`, ['Count date', 'Item', 'Unit', 'System qty', 'Counted qty', 'Unit cost', 'Value'], rows);
      }
    }
  } catch (err) {
    console.error(`GET /api/admin/statements/year/${req.params.fy}/export:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
