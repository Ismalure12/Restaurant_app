import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import type { AdminSession } from '../../lib/auth/auth.js';
import { searchParams } from '../../utils/query.js';
import { getOrderPrefix, parseOrderCode } from '../../lib/orders/orderCode.js';
import { filtersWhere, num, parseRange, parseSalesFilters, round2, salesWhere, type SalesFilters } from '../../lib/reports/common.js';
import { LEDGER_ORDER, LEDGER_SELECT, allLedgerRows, ledgerRow, itemsSoldIn } from '../../lib/reports/sales.js';
import { exportFormat, FORMAT_ERROR, sendReport } from '../../lib/reports/export.js';
import { describeSalesFilters, itemsSoldExport, salesHistoryExport } from '../../lib/reports/exportSpecs.js';
import type { DayRange } from '../../lib/time/businessTime.js';

// GET /api/admin/sales — POS › Sales history: every closed sale, searchable.
//   Range (local days) + the Sales-report filters (staffId, waiterId, personId,
//   account, source, orderType), plus:
//     q      — order ID (KFG-260919-0042 / 42), receipt # (0007), customer or
//              contact name/phone, table
//     status — completed (default: counts as a sale) | voided (closed, then
//              voided or declined) | all (both)
//   JSON: cursor-paginated rows (?cursor=<id>&limit=50, max 200).
//   The first page also carries `summary` (?summary=0 skips it):
//     {count, total} of the rows listed, plus — for the same range, filters
//     and search whatever the status — sales {count,total} (completed),
//     onAccount {count,total} (completed On account), voided {count,total},
//     itemsSold (units) and dishes (distinct dish names) across the completed
//     sales (OrderItem rows, one groupBy). And ?format=csv (every matching row).
// Everyone the `sales` permission lets in gets the same view — summary and
// exports included; a waiter sees (and exports) only the sales they served or
// rang up (forced here, never a filter the browser could drop).
// Cashier filter options: GET /api/admin/sales/cashiers.
// Items sold for the same view: GET /api/admin/sales/items.
const querySchema = z.object({
  q: z.string().trim().max(80, 'Search is too long').optional(),
  status: z.enum(['completed', 'voided', 'all'], { error: 'status must be completed, voided or all' }).optional(),
});

const ci = (q: string) => ({ contains: q, mode: 'insensitive' as const });

/** What a search box term can mean on a sale. */
export function searchWhere(q: string): Prisma.OrderWhereInput {
  const or: Prisma.OrderWhereInput[] = [
    { contactName: ci(q) }, { contactPhone: { contains: q } }, { tableNumber: { equals: q, mode: 'insensitive' } },
    { customer: { name: ci(q) } }, { customer: { phone: { contains: q } } },
    { client: { name: ci(q) } }, { client: { phone: { contains: q } } },
  ];
  const id = parseOrderCode(q);
  if (id) or.push({ id });
  if (/^\d{1,5}$/.test(q)) or.push({ receiptNo: Number(q) });
  return { OR: or };
}

/** Closed sales that were voided/declined afterwards (money back or owed back). */
export function voidedWhere(range: DayRange): Prisma.OrderWhereInput {
  return { closedAt: { gte: range.from, lt: range.to }, status: { in: ['voided', 'declined'] } };
}

type HistoryQuery =
  | {
    ok: true;
    where: Prisma.OrderWhereInput;
    range: DayRange;
    /** The same view split by status (for the summary): completed sales, and voided ones. */
    parts: { sales: Prisma.OrderWhereInput; voided: Prisma.OrderWhereInput };
    /** What the view was asked for, for an export's "Filters" line. */
    asked: { filters: SalesFilters; q?: string; status: string };
  }
  | { ok: false; error: string };

/**
 * The range, filters, search and status of a Sales history view → one Order
 * where. A waiter is always narrowed to the sales they served or rang up.
 * Shared with GET /api/admin/sales/items so both show the same sales.
 */
export function historyQuery(req: Request, session: AdminSession): HistoryQuery {
  const range = parseRange(req);
  if (!range.ok) return { ok: false, error: range.error };
  const filters = parseSalesFilters(req);
  if (!filters.ok) return { ok: false, error: filters.error };
  const sp = searchParams(req);
  const parsed = querySchema.safeParse({ q: sp.get('q') || undefined, status: sp.get('status') || undefined });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid search' };
  const { q, status = 'completed' } = parsed.data;
  const own: Prisma.OrderWhereInput[] = session.role === 'waiter'
    ? [{ OR: [{ waiterId: session.userId }, { staffId: session.userId }] }]
    : [];
  // AND keeps each part's own OR (sale = paid OR on account; search = any field).
  const rest = [filtersWhere(filters.value), ...own, ...(q ? [searchWhere(q)] : [])];
  const sale = salesWhere(range.value);
  const voided = voidedWhere(range.value);
  const statusWhere = status === 'voided' ? voided : status === 'all' ? { OR: [sale, voided] } : sale;
  return {
    ok: true,
    range: range.value,
    where: { AND: [statusWhere, ...rest] },
    parts: { sales: { AND: [sale, ...rest] }, voided: { AND: [voided, ...rest] } },
    asked: { filters: filters.value, q, status },
  };
}

// Distinct dishes in one view are bounded by the menu; the cap only guards a runaway.
const DISH_CAP = 2000;
const sumOf = (a: { _sum: { total: unknown }; _count: { _all: number } }) => ({ count: a._count._all, total: round2(num(a._sum.total)) });

/** Summary for one Sales history view — aggregates only, never rows. */
async function historySummary(where: Prisma.OrderWhereInput, parts: { sales: Prisma.OrderWhereInput; voided: Prisma.OrderWhereInput }) {
  const agg = (w: Prisma.OrderWhereInput) => prisma.order.aggregate({ where: w, _sum: { total: true }, _count: { _all: true } });
  const [listed, sales, onAccount, voided, dishes] = await Promise.all([
    agg(where),
    agg(parts.sales),
    agg({ AND: [parts.sales, { paymentMethod: 'invoice' }] }),
    agg(parts.voided),
    prisma.orderItem.groupBy({
      by: ['name'], where: { order: parts.sales }, _sum: { quantity: true }, orderBy: { name: 'asc' }, take: DISH_CAP,
    }),
  ]);
  return {
    ...sumOf(listed),
    sales: sumOf(sales),
    onAccount: sumOf(onAccount),
    voided: sumOf(voided),
    itemsSold: dishes.reduce((n, d) => n + num(d._sum?.quantity), 0),
    dishes: dishes.length,
  };
}

const STATUS_WORD: Record<string, string> = { completed: 'Completed sales', voided: 'Voided sales', all: 'Completed and voided' };

/** The view's filters, search and status in words, for an export's heading. */
async function historyWords(asked: { filters: SalesFilters; q?: string; status: string }): Promise<[string, string][]> {
  const words = await describeSalesFilters(prisma, asked.filters);
  if (asked.q) words.push(['Search', `“${asked.q}”`]);
  if (asked.status !== 'completed') words.push(['Showing', STATUS_WORD[asked.status] ?? asked.status]);
  return words;
}

export async function listSales(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'sales', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!auth.session.userId) return res.status(401).json({ error: 'Unauthorized' });

  const hq = historyQuery(req, auth.session);
  if (!hq.ok) return res.status(400).json({ error: hq.error });
  const { where, range } = hq;
  const sp = searchParams(req);
  const format = exportFormat(req);
  if (format === 'invalid') return res.status(400).json({ error: FORMAT_ERROR });
  const limit = Math.min(Math.max(parseInt(sp.get('limit') ?? '50', 10) || 50, 1), 200);
  const cursor = parseInt(sp.get('cursor') ?? '', 10);
  const hasCursor = Number.isFinite(cursor) && cursor > 0;

  try {
    const prefix = await getOrderPrefix(prisma);
    if (format) {
      const [rows, summary, words] = await Promise.all([
        allLedgerRows(prisma, where, prefix),
        historySummary(where, hq.parts),
        historyWords(hq.asked),
      ]);
      return await sendReport(req, res, format, salesHistoryExport(rows, { from: range.fromKey, to: range.toKey }, words, summary));
    }
    const wantSummary = !hasCursor && sp.get('summary') !== '0';
    const [page, summary] = await Promise.all([
      prisma.order.findMany({
        where, select: LEDGER_SELECT, orderBy: LEDGER_ORDER, take: limit + 1,
        ...(hasCursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      wantSummary ? historySummary(where, hq.parts) : null,
    ]);
    const hasMore = page.length > limit;
    const rows = (hasMore ? page.slice(0, limit) : page).map((o) => ledgerRow(o, prefix));
    return res.json({
      rows,
      nextCursor: hasMore ? rows[rows.length - 1].id : null,
      ...(summary ? { summary } : {}),
    });
  } catch (err) {
    console.error('GET /api/admin/sales:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/sales/items — Sales history › Items sold: qty and line value
// per item across exactly the sales the Sales history list shows for the same
// query (range, filters, q, status). Everyone on the Register; a waiter only
// counts the sales they served or rang up (see historyQuery).
// ?format=csv|xlsx = the same rows as a file (same access as the list).
export async function listSoldItems(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'sales', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!auth.session.userId) return res.status(401).json({ error: 'Unauthorized' });

  const hq = historyQuery(req, auth.session);
  if (!hq.ok) return res.status(400).json({ error: hq.error });
  const format = exportFormat(req);
  if (format === 'invalid') return res.status(400).json({ error: FORMAT_ERROR });

  try {
    const items = await itemsSoldIn(prisma, hq.where);
    if (format) {
      return await sendReport(req, res, format,
        itemsSoldExport(items, { from: hq.range.fromKey, to: hq.range.toKey }, await historyWords(hq.asked)));
    }
    return res.json({
      items,
      units: items.reduce((n, i) => n + i.qty, 0),
      total: round2(items.reduce((n, i) => n + i.total, 0)),
    });
  } catch (err) {
    console.error('GET /api/admin/sales/items:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/sales/cashiers — the Sales history "Cashier" filter: every
// login that rings up sales (admin, manager, cashier), id + name only, for
// anyone allowed on Sales history (GET /api/users is manager-tier).
export async function listSaleCashiers(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'sales', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    const users = await prisma.adminUser.findMany({
      where: { role: { in: ['admin', 'manager', 'cashier'] } },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      select: { id: true, name: true, email: true },
      take: 500,
    });
    return res.json(users.map((u) => ({ id: u.id, name: u.name || u.email.split('@')[0] })));
  } catch (err) {
    console.error('GET /api/admin/sales/cashiers:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
