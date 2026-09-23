// Financial report: profit & loss for the range.
//
//   Sales paid at the till/online  + Sales billed On account = Total sales
//   Total sales − Expenses (salaries, stock purchases logged with a cost, …) = Net profit
//
// Only the P&L lives here. Sales by account → Sales report; expenses by
// category → Expenses page; what customers owe → Customers (Owing).
import type { Db } from '../db/prisma.js';
import type { DayRange } from '../time/businessTime.js';
import { addDays, dayKey } from '../time/businessTime.js';
import { num, round2, salesWhere } from './common.js';

const EXPENSE_BATCH = 2000;

export async function financialReport(db: Db, range: DayRange) {
  const where = salesWhere(range);
  const expenseWhere = { incurredAt: { gte: range.from, lt: range.to } };
  const [byMethod, byDayRaw, expensesAgg, taxRow] = await Promise.all([
    db.order.groupBy({ by: ['paymentMethod'], where, _sum: { total: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ['receiptDay'], where, _sum: { total: true } }),
    db.expense.aggregate({ where: expenseWhere, _sum: { amount: true }, _count: { _all: true } }),
    db.setting.findUnique({ where: { key: 'tax_rate' } }),
  ]);

  let paidSales = 0;
  let billedOnAccount = 0;
  let orders = 0;
  for (const r of byMethod) {
    const amount = num(r._sum.total);
    orders += r._count._all;
    if (r.paymentMethod === 'invoice') billedOnAccount += amount;
    else paidSales += amount;
  }
  const expensesTotal = round2(num(expensesAgg._sum.amount));
  const totalSales = paidSales + billedOnAccount;
  const taxRate = Number(taxRow?.value) > 0 ? Number(taxRow!.value) : 0;
  const includedTax = taxRate > 0 ? totalSales - totalSales / (1 + taxRate / 100) : 0;

  // Sales vs expenses per local day. Expenses have no day column, so the
  // range's rows are streamed (bounded by the range, in batches).
  const expByDay = new Map<string, number>();
  let cursor: number | undefined;
  for (;;) {
    const batch = await db.expense.findMany({
      where: expenseWhere, select: { id: true, amount: true, incurredAt: true },
      orderBy: { id: 'asc' }, take: EXPENSE_BATCH, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const e of batch) {
      const k = dayKey(e.incurredAt);
      expByDay.set(k, round2((expByDay.get(k) ?? 0) + num(e.amount)));
    }
    if (batch.length < EXPENSE_BATCH) break;
    cursor = batch[batch.length - 1].id;
  }
  const salesByDay = new Map(byDayRaw.map((r) => [r.receiptDay, num(r._sum.total)]));
  const byDay: { day: string; sales: number; expenses: number; net: number }[] = [];
  for (let d = range.fromKey; d <= range.toKey; d = addDays(d, 1)) {
    const sales = round2(salesByDay.get(d) ?? 0);
    const exp = expByDay.get(d) ?? 0;
    byDay.push({ day: d, sales, expenses: exp, net: round2(sales - exp) });
  }

  return {
    from: range.fromKey,
    to: range.toKey,
    pnl: {
      orders,
      paidSales: round2(paidSales),
      billedOnAccount: round2(billedOnAccount),
      totalSales: round2(totalSales),
      taxRate,
      includedTax: round2(includedTax),
      expenses: expensesTotal,
      expenseCount: expensesAgg._count._all,
      netProfit: round2(totalSales - expensesTotal),
      margin: totalSales > 0 ? round2(((totalSales - expensesTotal) / totalSales) * 100) : null,
    },
    byDay,
    // Only the days that lost money (expenses above sales), worst first — the rest is noise.
    lossDays: byDay.filter((d) => d.net < 0).sort((a, b) => a.net - b.net),
  };
}
