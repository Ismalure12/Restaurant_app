import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../lib/db/prisma.js';
import { MANAGER_ROLES, requirePage } from '../../lib/auth/auth.js';
import type { AdminSession } from '../../lib/auth/auth.js';
import { searchParams } from '../../utils/query.js';
import { getOrderPrefix, parseOrderCode } from '../../lib/orders/orderCode.js';
import { filtersWhere, num, parseRange, parseSalesFilters, round2, salesWhere, sendCsv } from '../../lib/reports/common.js';
import { LEDGER_CSV_HEADER, LEDGER_ORDER, LEDGER_SELECT, allLedgerRows, ledgerCsvRow, ledgerRow, itemsSoldIn } from '../../lib/reports/sales.js';
import type { DayRange } from '../../lib/time/businessTime.js';

// GET /api/admin/sales — POS › Sales history: every closed sale, searchable.
//   Range (local days) + the Sales-report filters (staffId, waiterId, personId,
//   account, source, orderType), plus:
//     q      — order ID (KFG-260919-0042 / 42), receipt # (0007), customer or
//              contact name/phone, table
//     status — completed (default: counts as a sale) | voided (closed, then
//              voided or declined) | all (both)
//   JSON: cursor-paginated rows (?cursor=<id>&limit=50, max 200).
//   Managers also get `summary` on the first page (?summary=0 skips it):
//     {count, total} of the rows listed, plus — for the same range, filters
//     and search whatever the status — sales {count,total} (completed),
//     onAccount {count,total} (completed On account), voided {count,total},
//     itemsSold (units) and dishes (distinct dish names) across the completed
//     sales (OrderItem rows, one groupBy). And ?format=csv (every matching row).
// Everyone on the Register: a cashier finds and reprints any sale; a waiter
// sees only the sales they served or rang up (forced here, never a filter the
// browser could drop); money totals and exports stay manager-only.
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
    /** The same view split by status (for the manager summary): completed sales, and voided ones. */
    parts: { sales: Prisma.OrderWhereInput; voided: Prisma.OrderWhereInput };
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
  };
}

// Distinct dishes in one view are bounded by the menu; the cap only guards a runaway.
const DISH_CAP = 2000;
const sumOf = (a: { _sum: { total: unknown }; _count: { _all: number } }) => ({ count: a._count._all, total: round2(num(a._sum.total)) });

/** Manager summary for one Sales history view — aggregates only, never rows. */
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

export async function listSales(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'sales', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!auth.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const isManager = MANAGER_ROLES.includes(auth.session.role as string);

  const hq = historyQuery(req, auth.session);
  if (!hq.ok) return res.status(400).json({ error: hq.error });
  const { where, range } = hq;
  const sp = searchParams(req);
  const csv = sp.get('format') === 'csv';
  if (csv && !isManager) return res.status(403).json({ error: 'Only a manager can export sales' });
  const limit = Math.min(Math.max(parseInt(sp.get('limit') ?? '50', 10) || 50, 1), 200);
  const cursor = parseInt(sp.get('cursor') ?? '', 10);
  const hasCursor = Number.isFinite(cursor) && cursor > 0;

  try {
    const prefix = await getOrderPrefix(prisma);
    if (csv) {
      const rows = await allLedgerRows(prisma, where, prefix);
      return sendCsv(res, `sales_${range.fromKey}_${range.toKey}.csv`, LEDGER_CSV_HEADER, rows.map(ledgerCsvRow));
    }
    const wantSummary = isManager && !hasCursor && sp.get('summary') !== '0';
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
// ?format=csv = the same rows as a file (managers only, like the sales CSV).
export async function listSoldItems(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'sales', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!auth.session.userId) return res.status(401).json({ error: 'Unauthorized' });

  const hq = historyQuery(req, auth.session);
  if (!hq.ok) return res.status(400).json({ error: hq.error });
  const csv = searchParams(req).get('format') === 'csv';
  if (csv && !MANAGER_ROLES.includes(auth.session.role as string)) {
    return res.status(403).json({ error: 'Only a manager can export sales' });
  }

  try {
    const items = await itemsSoldIn(prisma, hq.where);
    if (csv) {
      return sendCsv(res, `items_sold_${hq.range.fromKey}_${hq.range.toKey}.csv`, ['Item', 'Qty', 'Sales'], items.map((i) => [i.name, i.qty, i.total]));
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
