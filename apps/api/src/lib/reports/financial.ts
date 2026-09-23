// Financial report: profit & loss for the range.
//
//   Sales paid at the till/online  + Sales billed On account = Total sales
//   Total sales − Expenses (salaries, stock purchases logged with a cost, …) = Net profit
//
// Expenses are also split by what they are (`expensesByKind`): stock
// purchases, operating costs and payroll — the kind comes from the expense's
// category row (ExpenseCategory.kind; a name with no row is operating, as in
// the month statement), and an expense paid through Payroll is payroll
// whatever its category. The three always add up to `expenses`.
//
// Only the P&L lives here. Sales by account → Sales report; expenses by
// category → Expenses page; what customers owe → Customers (Owing).
import type { Db } from '../db/prisma.js';
import type { DayRange } from '../time/businessTime.js';
import { addDays, dayKey } from '../time/businessTime.js';
import { categoryKinds } from '../money/expenseCategories.js';
import { num, round2, salesWhere } from './common.js';

const EXPENSE_BATCH = 2000;

export async function financialReport(db: Db, range: DayRange) {
  const where = salesWhere(range);
  const expenseWhere = { incurredAt: { gte: range.from, lt: range.to } };
  const [byMethod, byDayRaw, expensesAgg, taxRow, byCategory, salaryAgg, kinds] = await Promise.all([
    db.order.groupBy({ by: ['paymentMethod'], where, _sum: { total: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ['receiptDay'], where, _sum: { total: true } }),
    db.expense.aggregate({ where: expenseWhere, _sum: { amount: true }, _count: { _all: true } }),
    db.setting.findUnique({ where: { key: 'tax_rate' } }),
    // One row per category name (bounded by the categories in use).
    db.expense.groupBy({ by: ['category'], where: { ...expenseWhere, salaryPayment: { is: null } }, _sum: { amount: true } }),
    db.expense.aggregate({ where: { ...expenseWhere, salaryPayment: { isNot: null } }, _sum: { amount: true } }),
    categoryKinds(db),
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

  const byKind = { stock_purchase: 0, operating: 0, payroll: num(salaryAgg?._sum?.amount) };
  for (const g of byCategory ?? []) {
    const kind = kinds.get(g.category);
    const k = kind === 'stock_purchase' || kind === 'payroll' ? kind : 'operating';
    byKind[k] += num(g._sum.amount);
  }
  const expensesByKind = {
    stock_purchase: round2(byKind.stock_purchase),
    operating: round2(byKind.operating),
    payroll: round2(byKind.payroll),
  };
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
      expensesByKind,
      netProfit: round2(totalSales - expensesTotal),
      margin: totalSales > 0 ? round2(((totalSales - expensesTotal) / totalSales) * 100) : null,
    },
    byDay,
    // Only the days that lost money (expenses above sales), worst first — the rest is noise.
    lossDays: byDay.filter((d) => d.net < 0).sort((a, b) => a.net - b.net),
  };
}
