import type { Request, Response } from 'express';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { addDays, dayKey, rangeFromQuery } from '../../lib/time/businessTime.js';
import { getOrderPrefix } from '../../lib/orders/orderCode.js';
import { filtersWhere, num, parseRange, parseSalesFilters, round2, salesWhere } from '../../lib/reports/common.js';
import { LEDGER_ORDER, LEDGER_SELECT, ledgerRow, salesByTime, salesReport } from '../../lib/reports/sales.js';
import { financialReport } from '../../lib/reports/financial.js';
import { currentMonth, groupRates, salaryFor } from '../../lib/money/salary.js';
import { outstandingReceivables } from '../../lib/money/receivables.js';
import { PAYROLL_ROLES } from './payroll.controller.js';
import { accountBalances, collectionsOn, readCalendar } from '../../lib/money/moneyReads.js';

// GET /api/admin/overview?from&to[&cfrom&cto]&source&orderType&account — the
// manager's decision page, in one call. It SUMMARISES; the detail (accounts,
// channels, hours, every dish) lives in the Sales report, which it links to.
//
//   • The PERIOD part follows the range and filters and compares with
//     `cfrom..cto` (the page picks a meaningful one: yesterday for today, the
//     same days last month for "this month"…; default = the equal-length period
//     just before). KPIs with deltas, the sales trend (+ comparison aligned day by
//     day, or hour by hour for a single day), cumulative sales vs expenses
//     ("covering costs"), top 5 dishes. Same libs as the reports → same numbers.
//   • The LIVE part ignores the range — what needs attention right now: unpaid
//     tabs, online orders to accept, low stock, salaries to pay, money in each
//     account, what each person collected today, and the latest sales.
// Manager tier. Default range: the last 7 days.
const delta = (now: number, before: number) => ({ value: round2(now), previous: round2(before) });

export async function getOverview(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'overview', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const range = parseRange(req, 7);
  if (!range.ok) return res.status(400).json({ error: range.error });
  const filters = parseSalesFilters(req);
  if (!filters.ok) return res.status(400).json({ error: filters.error });
  const r = range.value;
  const f = filters.value;
  const filtered = Object.keys(f).length > 0;

  const now = new Date();
  const today = dayKey(now);
  const month = currentMonth(now);
  // The comparison period: what the page asked for, else the equal-length period just before.
  const sp = new URLSearchParams(req.url.split('?')[1] ?? '');
  const cmp = sp.get('cfrom') || sp.get('cto')
    ? rangeFromQuery(sp.get('cfrom'), sp.get('cto'), { maxDays: 400 })
    : rangeFromQuery(addDays(r.fromKey, -r.days), addDays(r.fromKey, -1), { maxDays: 400 });
  if (cmp.error) return res.status(400).json({ error: `Comparison period: ${cmp.error}` });
  const prev = cmp.range!;
  if (prev.fromKey >= r.fromKey) return res.status(400).json({ error: 'The comparison period must come before the chosen period' });
  const oneDay = r.days === 1;

  try {
    const [sales, fin, prevAgg, prevOnAcct, prevExp, receivable, recentRaw, prefix, prevDays, prevTime] = await Promise.all([
      salesReport(prisma, r, f),
      // Expenses aren't tied to a channel, so profit is only meaningful unfiltered.
      financialReport(prisma, r),
      prisma.order.aggregate({ where: { ...salesWhere(prev), ...filtersWhere(f) }, _sum: { total: true }, _count: { _all: true } }),
      prisma.order.aggregate({ where: { ...salesWhere(prev), ...filtersWhere(f), paymentMethod: 'invoice' }, _sum: { total: true } }),
      prisma.expense.aggregate({ where: { incurredAt: { gte: prev.from, lt: prev.to } }, _sum: { amount: true } }),
      outstandingReceivables(prisma),
      prisma.order.findMany({ where: { ...salesWhere(r), ...filtersWhere(f) }, select: LEDGER_SELECT, orderBy: LEDGER_ORDER, take: 5 }),
      getOrderPrefix(prisma),
      // Previous period's per-day sales for the "vs before" line (aligned by position).
      prisma.order.groupBy({ by: ['receiptDay'], where: { ...salesWhere(prev), ...filtersWhere(f) }, _sum: { total: true } }),
      // A single day's main chart is by hour, against the comparison day's hours.
      oneDay ? salesByTime(prisma, { ...salesWhere(prev), ...filtersWhere(f) }) : Promise.resolve(null),
    ]);
    const prevMap = new Map(prevDays.map((d) => [d.receiptDay, num(d._sum.total)]));
    const expByDay = new Map(fin.byDay.map((d) => [d.day, d.expenses]));

    const prevSales = num(prevAgg._sum.total);
    const prevOrders = prevAgg._count._all;
    const expenses = fin.pnl.expenses;
    const profit = round2(sales.summary.netSales - expenses);
    const prevProfit = round2(prevSales - num(prevExp._sum.amount));

    // ── live block ────────────────────────────────────────────────────
    const [unpaid, awaiting, stock, staff, rates, paid, calendar, collections] = await Promise.all([
      prisma.order.aggregate({ where: { status: 'open' }, _sum: { total: true }, _count: { _all: true } }),
      prisma.order.count({ where: { source: 'online', status: 'pending' } }),
      prisma.inventoryItem.findMany({
        where: { isActive: true, reorderLevel: { not: null } },
        select: { id: true, name: true, unit: true, quantity: true, reorderLevel: true },
        orderBy: { name: 'asc' }, take: 500,
      }),
      prisma.adminUser.findMany({ where: { role: { in: PAYROLL_ROLES }, isActive: true }, select: { id: true }, take: 500 }),
      prisma.salaryRate.findMany({ select: { staffId: true, amount: true, fromMonth: true }, take: 5000 }),
      prisma.salaryPayment.findMany({ where: { month }, select: { staffId: true }, take: 500 }),
      readCalendar(prisma),
      collectionsOn(prisma, today),
    ]);
    const balances = calendar.openingDate ? await accountBalances(prisma, calendar.openingDate, today) : null;
    const lowStock = stock
      .filter((i) => Number(i.quantity) <= Number(i.reorderLevel))
      .map((i) => ({ id: i.id, name: i.name, unit: i.unit, quantity: Number(i.quantity), out: Number(i.quantity) <= 0 }));
    const ratesOf = groupRates(rates);
    const paidIds = new Set(paid.map((p) => p.staffId));
    const salariesToPay = staff.filter((s) => !paidIds.has(s.id) && salaryFor(ratesOf.get(s.id) ?? [], month) > 0).length;

    // Running totals: are sales covering the costs so far? (the gap is the profit)
    let runSales = 0;
    let runExp = 0;
    const cumulative = sales.byDay.map((d) => {
      runSales = round2(runSales + d.total);
      runExp = round2(runExp + (expByDay.get(d.day) ?? 0));
      return { day: d.day, sales: runSales, expenses: runExp };
    });
    const hourMap = new Map(sales.byHour.map((h) => [h.hour, h.total]));
    const prevHourMap = new Map((prevTime?.byHour ?? []).map((h) => [h.hour, h.total]));
    const busyHours = [...hourMap.keys(), ...prevHourMap.keys()];
    const hours = oneDay && busyHours.length
      ? Array.from({ length: Math.max(...busyHours) - Math.min(...busyHours) + 1 }, (_, i) => {
        const hour = Math.min(...busyHours) + i;
        return { hour, sales: round2(hourMap.get(hour) ?? 0), previous: round2(prevHourMap.get(hour) ?? 0) };
      })
      : [];

    return res.json({
      range: { from: r.fromKey, to: r.toKey, days: r.days },
      previous: { from: prev.fromKey, to: prev.toKey },
      filtered,
      kpis: {
        sales: delta(sales.summary.netSales, prevSales),
        orders: delta(sales.summary.orders, prevOrders),
        avgTicket: delta(sales.summary.avgTicket, prevOrders ? prevSales / prevOrders : 0),
        onAccount: { ...delta(sales.summary.onAccount.total, num(prevOnAcct._sum.total)), orders: sales.summary.onAccount.orders },
        // Profit and expenses ignore the channel/service/account filters (they belong to the whole business).
        expenses: { ...delta(expenses, num(prevExp._sum.amount)), applies: !filtered },
        profit: { ...delta(profit, prevProfit), applies: !filtered },
        voids: sales.summary.voids,
        margin: sales.summary.netSales > 0 ? round2((profit / sales.summary.netSales) * 100) : null,
      },
      receivable,
      trend: sales.byDay.map((d, i) => ({
        day: d.day, sales: d.total, orders: d.orders,
        expenses: round2(expByDay.get(d.day) ?? 0),
        previous: round2(prevMap.get(addDays(prev.fromKey, i)) ?? 0),
      })),
      hours,
      cumulative,
      topDishes: sales.items.items.slice(0, 5),
      itemsValue: sales.items.totals.revenue,
      recent: recentRaw.map((o) => ledgerRow(o, prefix)),
      live: {
        unpaid: { count: unpaid._count._all, total: round2(num(unpaid._sum.total)) },
        awaitingDecision: awaiting,
        lowStock: { count: lowStock.length, items: lowStock.slice(0, 8) },
        salariesToPay,
        money: balances ? { total: balances.total, accounts: balances.accounts.filter((a) => a.isActive || a.balance).map((a) => ({ id: a.id, label: a.label, kind: a.kind, balance: a.balance, today: a.today })) } : null,
        collections: { accounts: collections.accounts, rows: collections.rows, total: collections.total },
      },
    });
  } catch (err) {
    console.error('GET /api/admin/overview:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
