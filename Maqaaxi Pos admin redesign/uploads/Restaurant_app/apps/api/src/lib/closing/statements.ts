// Month statements (docs/system-blueprint.md §3.5): profit & loss with cost of
// goods, cash flow per business account, and the business position — computed
// live for an open month and frozen (PeriodClose.snapshot) when it is closed.
//
//   net sales   = gross − discounts − refunds                 (salesFigures)
//   cost of goods = opening stock + purchases − closing stock (counted, not
//                   deducted from menu sales — no recipes)
//   gross profit, food cost %
//   − operating expenses (kind operating) − payroll (accrued per month)
//   ± cash over/short from the day closes
//   = net profit
//
// Position = business money + stock + owed by customers − owed to suppliers −
// salaries unpaid. Checked against the last closed month:
//   change in position = net profit + owner money in − owner money out
// Anything else is reported as "unexplained".
import type { Db } from '../db/prisma.js';
import { addDays, dayKey, startOfDay } from '../time/businessTime.js';
import { readCalendar, statementTotals } from '../money/moneyReads.js';
import { salesFigures } from './salesFigures.js';
import { categoryKinds } from '../money/expenseCategories.js';
import { supplierOwedAt } from '../money/suppliers.js';
import { salaryFor } from '../money/salary.js';
import { num, round2 } from '../reports/common.js';

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const PAYROLL_ROLES = ['admin', 'manager', 'cashier', 'waiter'];

export const nextMonth = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
};
export const prevMonthOf = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`;
};

/** First/last business day of a month plus the UTC bounds [from, to). */
export function monthRange(month: string) {
  const first = `${month}-01`;
  const last = addDays(`${nextMonth(month)}-01`, -1);
  return { first, last, from: startOfDay(first), to: startOfDay(addDays(last, 1)) };
}

const money = (n: unknown) => round2(num(n));

// ── Stock ───────────────────────────────────────────────────────────────

/** Value of the latest posted stock count dated inside `month` (null = none). */
async function countValueIn(db: Db, first: string, last: string) {
  const c = await db.stockCount.findFirst({
    where: { status: 'posted', countedOn: { gte: first, lte: last } },
    orderBy: [{ countedOn: 'desc' }, { id: 'desc' }],
    select: { totalValue: true, countedOn: true },
  });
  return c ? { value: money(c.totalValue), on: c.countedOn } : null;
}

// ── Payroll, accrued month by month from the opening month ──────────────

async function payrollAccrual(db: Db, month: string, openingMonth: string, to: Date) {
  const [staff, rates, payments] = await Promise.all([
    db.adminUser.findMany({ where: { role: { in: PAYROLL_ROLES }, isActive: true }, select: { id: true } }),
    db.salaryRate.findMany({ select: { staffId: true, amount: true, fromMonth: true } }),
    db.salaryPayment.findMany({ where: { month: { gte: openingMonth, lte: month } }, select: { staffId: true, month: true, amount: true, paidAt: true } }),
  ]);
  const ratesOf = new Map<number, { fromMonth: string; amount: unknown }[]>();
  for (const r of rates) (ratesOf.get(r.staffId) ?? ratesOf.set(r.staffId, []).get(r.staffId)!).push(r);

  let accruedThisMonth = 0;
  let unpaidAtEnd = 0;
  for (let m = openingMonth; m <= month; m = nextMonth(m)) {
    const ids = new Set<number>(staff.map((s) => s.id));
    for (const p of payments) if (p.month === m) ids.add(p.staffId);
    let accrued = 0;
    let paidByEnd = 0;
    for (const id of ids) {
      const due = staff.some((s) => s.id === id) ? salaryFor(ratesOf.get(id) ?? [], m) : 0;
      const mine = payments.filter((p) => p.staffId === id && p.month === m);
      const paidAny = mine.reduce((s, p) => s + num(p.amount), 0);
      accrued += Math.max(due, paidAny);
      paidByEnd += mine.filter((p) => p.paidAt < to).reduce((s, p) => s + num(p.amount), 0);
    }
    if (m === month) accruedThisMonth = accrued;
    unpaidAtEnd += Math.max(0, accrued - paidByEnd);
  }
  return { accrued: round2(accruedThisMonth), unpaidAtEnd: round2(unpaidAtEnd) };
}

// ── The statement ───────────────────────────────────────────────────────

export type MonthStatement = Awaited<ReturnType<typeof liveMonthStatement>>;

export async function liveMonthStatement(db: Db, month: string) {
  const cal = await readCalendar(db);
  const { first, last, from, to } = monthRange(month);
  const base = { month, from: first, to: last, openingDate: cal.openingDate };
  if (!cal.openingDate) return { ...base, blocked: 'needs-opening' as const };
  const openingMonth = cal.openingDate.slice(0, 7);
  if (month < openingMonth) return { ...base, blocked: 'before-opening' as const };

  const inMonth = { gte: from, lt: to };
  const prev = month > openingMonth ? await db.periodClose.findUnique({ where: { period: prevMonthOf(month) } }) : null;
  const prevSnap = prev?.isClosed ? (prev.snapshot as unknown as { pnl?: { closingStock?: number | null }; position?: { net?: number } }) : null;

  const kinds = await categoryKinds(db);
  const namesOf = (kind: string) => [...kinds].filter(([, k]) => k === kind).map(([n]) => n);
  const stockCats = namesOf('stock_purchase');
  const payrollCats = namesOf('payroll');

  const [sales, boughtAgg, unlinkedAgg, expenseGroups, overShortAgg, ownerAgg, closing, openingCount, accounts, owedIn, owedPaid, payroll, supplierOwed] = await Promise.all([
    salesFigures(db, from, to),
    db.stockMovement.aggregate({ where: { type: 'purchase', totalCost: { gt: 0 }, createdAt: inMonth }, _sum: { totalCost: true } }),
    db.expense.aggregate({ where: { category: { in: stockCats }, incurredAt: inMonth, movement: { is: null }, salaryPayment: { is: null } }, _sum: { amount: true } }),
    db.expense.groupBy({ by: ['category'], where: { incurredAt: inMonth, salaryPayment: { is: null }, category: { notIn: stockCats } }, _sum: { amount: true } }),
    db.accountEntry.aggregate({ where: { kind: 'over_short', businessDay: { gte: first, lte: last } }, _sum: { amount: true } }),
    db.accountEntry.groupBy({ by: ['kind'], where: { kind: { in: ['owner_in', 'owner_out'] }, businessDay: { gte: first, lte: last } }, _sum: { amount: true } }),
    countValueIn(db, first, last),
    prevSnap ? Promise.resolve(null) : db.stockCount.findFirst({
      where: { status: 'posted', countedOn: { lte: month === openingMonth ? cal.openingDate : first } },
      orderBy: [{ countedOn: 'desc' }, { id: 'desc' }], select: { totalValue: true, countedOn: true },
    }),
    db.moneyAccount.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    db.invoice.aggregate({ where: { createdAt: { lt: to }, status: { not: 'void' } }, _sum: { total: true } }),
    db.invoicePayment.aggregate({ where: { paidAt: { lt: to }, invoice: { status: { not: 'void' }, createdAt: { lt: to } } }, _sum: { amount: true } }),
    payrollAccrual(db, month, openingMonth, to),
    supplierOwedAt(db, to),
  ]);

  const warnings: string[] = [];
  const closingStock = closing ? closing.value : null;
  if (closing == null) warnings.push('No stock count is posted for this month yet — count the stock (Inventory › Counts) to get the cost of goods.');
  const openingStock = prevSnap ? money(prevSnap.pnl?.closingStock ?? 0) : openingCount ? money(openingCount.totalValue) : 0;
  if (!prevSnap && !openingCount) warnings.push('There is no opening stock count — opening stock is taken as 0.');
  if (month > openingMonth && !prevSnap) warnings.push(`${prevMonthOf(month)} is not closed yet — close it first.`);

  const purchases = money(num(boughtAgg._sum.totalCost) + num(unlinkedAgg._sum.amount));
  const cogs = round2(openingStock + purchases - (closingStock ?? 0));
  const grossProfit = round2(sales.net - cogs);

  const opexBy: { category: string; amount: number }[] = [];
  let manualPayroll = 0;
  for (const g of expenseGroups) {
    const amount = money(g._sum.amount);
    if (payrollCats.includes(g.category)) manualPayroll += amount;
    else opexBy.push({ category: g.category, amount });
  }
  opexBy.sort((a, b) => b.amount - a.amount);
  const operating = round2(opexBy.reduce((s, c) => s + c.amount, 0));
  const payrollCost = round2(payroll.accrued + manualPayroll);
  const overShort = money(overShortAgg._sum.amount);
  const netProfit = round2(grossProfit - operating - payrollCost + overShort);

  // Cash flow per business account, from the cash book.
  const flows = await Promise.all(accounts.map(async (a) => {
    const t = await statementTotals(db, a, cal.openingDate!, first, last);
    return { accountId: a.id, label: a.label, kind: a.kind, isActive: a.isActive, ...t };
  }));
  const shown = flows.filter((f) => f.isActive || f.opening !== 0 || f.moneyIn !== 0 || f.moneyOut !== 0 || f.closing !== 0);
  const sum = (k: 'opening' | 'moneyIn' | 'moneyOut' | 'closing') => round2(shown.reduce((s, f) => s + f[k], 0));

  const receivable = money(num(owedIn._sum.total) - num(owedPaid._sum.amount));
  const ownerIn = money(ownerAgg.find((o) => o.kind === 'owner_in')?._sum.amount);
  const ownerOut = money(-num(ownerAgg.find((o) => o.kind === 'owner_out')?._sum.amount));
  const money$ = sum('closing');
  const stockValue = closingStock ?? 0;
  const net = round2(money$ + stockValue + receivable - supplierOwed - payroll.unpaidAtEnd);

  let check: null | { previous: number; change: number; expected: number; unexplained: number } = null;
  if (prevSnap?.position?.net != null) {
    const change = round2(net - prevSnap.position.net);
    const expected = round2(netProfit + ownerIn - ownerOut);
    check = { previous: prevSnap.position.net, change, expected, unexplained: round2(change - expected) };
    if (Math.abs(check.unexplained) >= 0.01) warnings.push(`The position changed by ${change.toFixed(2)} but profit and owner money explain ${expected.toFixed(2)} — ${check.unexplained.toFixed(2)} is unexplained.`);
  }

  return {
    ...base,
    blocked: null,
    complete: closing != null,
    warnings,
    pnl: {
      sales: { gross: sales.gross, discounts: sales.discounts, refunds: sales.refunds, net: sales.net, count: sales.count, refundCount: sales.refundCount },
      openingStock, purchases, closingStock, cogs, grossProfit,
      foodCostPct: sales.net > 0 && closingStock != null ? round2((cogs / sales.net) * 100) : null,
      operating: { total: operating, byCategory: opexBy },
      payroll: payrollCost,
      overShort,
      netProfit,
    },
    cashFlow: {
      accounts: shown.map((f) => ({ accountId: f.accountId, label: f.label, kind: f.kind, opening: f.opening, moneyIn: f.moneyIn, moneyOut: f.moneyOut, closing: f.closing, byKind: f.byKind })),
      total: { opening: sum('opening'), moneyIn: sum('moneyIn'), moneyOut: sum('moneyOut'), closing: sum('closing') },
    },
    position: {
      money: money$, stock: stockValue, customersOwe: receivable, suppliersOwed: supplierOwed, salariesUnpaid: payroll.unpaidAtEnd,
      net, ownerIn, ownerOut, check,
    },
  };
}

/** Days of `month` (from the opening date on) that are not closed yet. */
export async function unclosedDaysIn(db: Db, month: string, openingDate: string) {
  const { first, last: monthEnd } = monthRange(month);
  const start = first < openingDate ? openingDate : first;
  // Only days that have ENDED can be closed — never list today or the future.
  const yesterday = addDays(dayKey(new Date()), -1);
  const last = monthEnd < yesterday ? monthEnd : yesterday;
  const closed = await db.dayClose.findMany({ where: { isClosed: true, businessDay: { gte: start, lte: last } }, select: { businessDay: true } });
  const done = new Set(closed.map((c) => c.businessDay));
  const days: string[] = [];
  for (let d = start; d <= last; d = addDays(d, 1)) if (!done.has(d)) days.push(d);
  return days;
}

export const isMonthEnded = (month: string, now = new Date()) => dayKey(now) > monthRange(month).last;
