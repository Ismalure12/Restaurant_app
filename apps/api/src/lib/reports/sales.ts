// Sales report: what sold, when (by day and by hour of day), and through which
// account. Who rang it up lives in the Employees report; every single sale in
// Sales history. Aggregates run as groupBy on the closed-sale
// window; items sold need the line JSON, so those stream the matching orders
// in fixed-size batches (never an unbounded read).
import type { Prisma } from '@prisma/client';
import type { Db } from '../db/prisma.js';
import type { DayRange } from '../time/businessTime.js';
import { addDays } from '../time/businessTime.js';
import { menuReport } from './menu.js';
import { env } from '../../config/env.js';
import { formatOrderCode } from '../orders/orderCode.js';
import { formatReceiptNo } from '../orders/receiptNo.js';
import { outstandingReceivables } from '../money/receivables.js';
import {
  accountKey, accountLabel, CHANNEL_LABEL, channelOf, filtersWhere, localHour, localStamp, num, round2, salesWhere, type SalesFilters,
} from './common.js';

const BATCH = 1000;
type Line = { name?: string; quantity?: number; unitPrice?: number };

/**
 * The Sales report (it also replaces the old Menu report): money by day, hour,
 * account, channel and service, plus what sold (OrderItem rows,
 * honouring every filter; `category` narrows only the items part).
 */
export async function salesReport(db: Db, range: DayRange, f: SalesFilters, opts: { category?: string } = {}) {
  const where = { ...salesWhere(range), ...filtersWhere(f) };
  const voidWhere: Prisma.OrderWhereInput = { status: 'voided', voidedAt: { gte: range.from, lt: range.to }, ...filtersWhere(f) };

  const [totals, byDayRaw, byAccountRaw, bySourceRaw, voids, refunds] = await Promise.all([
    db.order.aggregate({ where, _sum: { total: true, discount: true, deliveryFee: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ['receiptDay'], where, _sum: { total: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ['source', 'paymentMethod', 'paymentAccount'], where, _sum: { total: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ['source', 'orderType'], where, _sum: { total: true }, _count: { _all: true } }),
    db.order.aggregate({ where: voidWhere, _sum: { total: true }, _count: { _all: true } }),
    db.order.aggregate({ where: { ...voidWhere, paymentStatus: 'refunded' }, _sum: { total: true } }),
  ]);

  const count = totals._count._all;
  const netSales = num(totals._sum.total);
  const discounts = num(totals._sum.discount);
  const deliveryFees = num(totals._sum.deliveryFee);

  // Every day in the range, including quiet ones, so a chart has no gaps.
  const dayMap = new Map(byDayRaw.map((r) => [r.receiptDay, r]));
  const byDay: { day: string; orders: number; total: number }[] = [];
  for (let d = range.fromKey; d <= range.toKey; d = addDays(d, 1)) {
    const r = dayMap.get(d);
    byDay.push({ day: d, orders: r?._count._all ?? 0, total: round2(num(r?._sum.total)) });
  }

  const accounts = new Map<string, { key: string; label: string; orders: number; total: number }>();
  for (const r of byAccountRaw) {
    const key = accountKey(r);
    const cur = accounts.get(key) ?? { key, label: accountLabel(key), orders: 0, total: 0 };
    cur.orders += r._count._all;
    cur.total = round2(cur.total + num(r._sum.total));
    accounts.set(key, cur);
  }

  const [items, time, receivable, lines] = await Promise.all([
    menuReport(db, range, { category: opts.category, orderFilter: filtersWhere(f) }),
    salesByTime(db, where),
    outstandingReceivables(db),
    linesSold(db, where),
  ]);
  // Sales billed On account in the range (honours the filters) vs what is still owed overall.
  const onAccountRows = byAccountRaw.filter((r) => r.paymentMethod === 'invoice');

  return {
    from: range.fromKey,
    to: range.toKey,
    summary: {
      orders: count,
      netSales: round2(netSales),
      // Menu value before discounts (items + delivery fees).
      grossSales: round2(netSales + discounts),
      discounts: round2(discounts),
      deliveryFees: round2(deliveryFees),
      avgTicket: count ? round2(netSales / count) : 0,
      // Units sold and distinct dishes across the same sales (every category;
      // the dish table below may be cut to its top rows, these never are).
      itemsSold: lines.itemsSold,
      dishesSold: lines.dishesSold,
      // Billed On account in this range, and what customers still owe in total.
      onAccount: { orders: onAccountRows.reduce((s, r) => s + r._count._all, 0), total: round2(onAccountRows.reduce((s, r) => s + num(r._sum.total), 0)) },
      receivable,
      voids: { count: voids._count._all, total: round2(num(voids._sum.total)) },
      refundsOwed: round2(num(refunds._sum.total)),
    },
    byDay,
    byHour: time.byHour,
    byAccount: [...accounts.values()].sort((a, b) => b.total - a.total),
    // Dine-in · Delivery (rung up in the restaurant) · Online (placed online, either service).
    byChannel: (() => {
      const m = new Map<string, { channel: string; label: string; orders: number; total: number }>();
      for (const r of bySourceRaw) {
        const c = channelOf(r);
        const cur = m.get(c) ?? { channel: c, label: CHANNEL_LABEL[c], orders: 0, total: 0 };
        cur.orders += r._count._all;
        cur.total = round2(cur.total + num(r._sum.total));
        m.set(c, cur);
      }
      return [...m.values()].sort((a, b) => b.total - a.total);
    })(),
    // What sold (menu value = line prices before order discounts): dishes, categories, never sold.
    items,
  };
}

// Distinct dishes are counted by menu item (a rename stays one dish); lines
// whose menu item was deleted count once per name, as in the Menu part.
const DISH_CAP = 10_000;

/** Units and distinct dishes over the sales matching `where` — DB aggregates, no line reads. */
export async function linesSold(db: Db, where: Prisma.OrderWhereInput) {
  const order = { order: where };
  const [units, byItem, byName] = await Promise.all([
    db.orderItem.aggregate({ where: order, _sum: { quantity: true } }),
    db.orderItem.groupBy({ by: ['menuItemId'], where: { ...order, menuItemId: { not: null } }, _count: { _all: true }, orderBy: { menuItemId: 'asc' }, take: DISH_CAP }),
    db.orderItem.groupBy({ by: ['name'], where: { ...order, menuItemId: null }, _count: { _all: true }, orderBy: { name: 'asc' }, take: DISH_CAP }),
  ]);
  return { itemsSold: num(units?._sum?.quantity), dishesSold: (byItem?.length ?? 0) + (byName?.length ?? 0) };
}

/**
 * Qty and line value per item name across the orders matching `where`, most
 * sold first. The lines live in the order's JSON, so the orders are streamed
 * in fixed-size batches (never an unbounded read). Line value is before any
 * order discount. Shared by the Sales report and Sales history › Items sold.
 */
export async function itemsSoldIn(db: Db, where: Prisma.OrderWhereInput) {
  const items = new Map<string, { name: string; qty: number; total: number }>();
  let cursor: number | undefined;
  for (;;) {
    const batch = await db.order.findMany({
      where, select: { id: true, items: true },
      orderBy: { id: 'asc' }, take: BATCH, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const o of batch) {
      for (const l of (Array.isArray(o.items) ? o.items : []) as Line[]) {
        const name = l.name || 'Item';
        const cur = items.get(name) ?? { name, qty: 0, total: 0 };
        const q = Number(l.quantity || 0);
        cur.qty += q;
        cur.total = round2(cur.total + Number(l.unitPrice || 0) * q);
        items.set(name, cur);
      }
    }
    if (batch.length < BATCH) break;
    cursor = batch[batch.length - 1].id;
  }
  return [...items.values()].sort((a, b) => b.qty - a.qty || b.total - a.total);
}

// ── Order ledger (paginated JSON, or every row for CSV) ─────────────────
export const LEDGER_SELECT = {
  id: true, createdAt: true, closedAt: true, receiptNo: true, receiptDay: true, source: true, orderType: true,
  tableNumber: true, status: true, paymentStatus: true, paymentMethod: true, paymentAccount: true,
  discount: true, deliveryFee: true, total: true, staffId: true, waiterId: true,
  customer: { select: { name: true } },
  client: { select: { name: true } },
  staff: { select: { name: true, email: true } },
  waiter: { select: { name: true, email: true } },
} satisfies Prisma.OrderSelect;

// Newest close first; id breaks ties so cursor paging is stable.
export const LEDGER_ORDER: Prisma.OrderOrderByWithRelationInput[] = [{ closedAt: 'desc' }, { id: 'desc' }];

type LedgerRow = Prisma.OrderGetPayload<{ select: typeof LEDGER_SELECT }>;
const who = (u: { name: string | null; email: string } | null) => (u ? u.name?.trim() || u.email : null);

export function ledgerRow(o: LedgerRow, prefix: string) {
  const key = accountKey(o);
  return {
    id: o.id,
    code: formatOrderCode(o, prefix),
    receiptNo: formatReceiptNo(o.receiptNo),
    receiptDay: o.receiptDay,
    closedAt: o.closedAt,
    source: o.source,
    orderType: o.orderType,
    tableNumber: o.tableNumber,
    customer: o.customer?.name ?? o.client?.name ?? null,
    staffId: o.staffId,
    waiterId: o.waiterId,
    cashier: who(o.staff),
    waiter: who(o.waiter),
    account: key,
    accountLabel: accountLabel(key),
    discount: round2(num(o.discount)),
    total: round2(num(o.total)),
    status: o.status,
    paymentStatus: o.paymentStatus,
    // 'invoice' tells an On-account sale from a paid one (Sales history status chip).
    paymentMethod: o.paymentMethod,
  };
}

export const LEDGER_CSV_HEADER = [
  'Order ID', 'Receipt #', 'Closed (local)', 'Source', 'Service', 'Table', 'Customer', 'Cashier', 'Waiter', 'Account', 'Discount', 'Total', 'Status',
];

export function ledgerCsvRow(r: ReturnType<typeof ledgerRow>) {
  return [
    r.code, r.receiptNo ?? '', localStamp(r.closedAt, env.BUSINESS_TZ), r.source === 'online' ? 'Online' : 'Counter',
    r.orderType === 'delivery' ? 'Delivery' : 'Dine-in', r.tableNumber ?? '', r.customer ?? '', r.cashier ?? '', r.waiter ?? '',
    r.accountLabel, r.discount.toFixed(2), r.total.toFixed(2), r.status,
  ];
}

/**
 * Sales per local hour (0–23), only hours that had a sale. One streamed pass
 * over id/closedAt/total.
 */
export async function salesByTime(db: Db, where: Prisma.OrderWhereInput) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, total: 0 }));
  let cursor: number | undefined;
  for (;;) {
    const batch = await db.order.findMany({
      where, select: { id: true, closedAt: true, total: true },
      orderBy: { id: 'asc' }, take: BATCH, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const o of batch) {
      if (!o.closedAt) continue;
      const h = hours[localHour(o.closedAt, env.BUSINESS_TZ)];
      h.orders += 1;
      h.total = round2(h.total + num(o.total));
    }
    if (batch.length < BATCH) break;
    cursor = batch[batch.length - 1].id;
  }
  return { byHour: hours.filter((h) => h.orders > 0) };
}

/** Every sale in the range, newest first, streamed in batches (CSV export). */
export async function allLedgerRows(db: Db, where: Prisma.OrderWhereInput, prefix: string) {
  const out: ReturnType<typeof ledgerRow>[] = [];
  let cursor: number | undefined;
  for (;;) {
    const batch = await db.order.findMany({
      where, select: LEDGER_SELECT, orderBy: LEDGER_ORDER, take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    out.push(...batch.map((o) => ledgerRow(o, prefix)));
    if (batch.length < BATCH) break;
    cursor = batch[batch.length - 1].id;
  }
  return out;
}
