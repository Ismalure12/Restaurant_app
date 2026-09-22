// Employee report: per staff member, what they rang up (cashier = took the
// money: Order.staffId), what they served (Order.waiterId), discounts given,
// voids and edits made, and money collected on invoices.
import type { Db } from '../db/prisma.js';
import type { DayRange } from '../time/businessTime.js';
import { addDays } from '../time/businessTime.js';
import { accountKey, accountLabel, num, round2, salesWhere } from './common.js';

export const STAFF_REPORT_ROLES = ['admin', 'manager', 'cashier', 'waiter'] as const;
const USER_CAP = 500;
async function metrics(db: Db, range: DayRange, staffId?: number) {
  const sales = salesWhere(range);
  const one = <T extends object>(field: string) => (staffId ? { [field]: staffId } : {}) as T;
  const [taken, served, voids, edits, collected] = await Promise.all([
    db.order.groupBy({ by: ['staffId'], where: { ...sales, ...one('staffId') }, _sum: { total: true, discount: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ['waiterId'], where: { ...sales, ...one('waiterId') }, _sum: { total: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ['voidedById'], where: { voidedAt: { gte: range.from, lt: range.to }, ...one('voidedById') }, _sum: { total: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ['editedById'], where: { editedAt: { gte: range.from, lt: range.to }, ...one('editedById') }, _count: { _all: true } }),
    db.invoicePayment.groupBy({ by: ['recordedBy'], where: { paidAt: { gte: range.from, lt: range.to }, ...one('recordedBy') }, _sum: { amount: true } }),
  ]);
  return { taken, served, voids, edits, collected };
}

function rowFor(user: { id: number; name: string | null; email: string; role: string; isActive: boolean }, m: Awaited<ReturnType<typeof metrics>>) {
  const t = m.taken.find((r) => r.staffId === user.id);
  const s = m.served.find((r) => r.waiterId === user.id);
  const v = m.voids.find((r) => r.voidedById === user.id);
  const e = m.edits.find((r) => r.editedById === user.id);
  const c = m.collected.find((r) => r.recordedBy === user.id);
  const takenOrders = t?._count._all ?? 0;
  const takenTotal = round2(num(t?._sum.total));
  const servedOrders = s?._count._all ?? 0;
  const servedTotal = round2(num(s?._sum.total));
  return {
    id: user.id,
    name: user.name?.trim() || user.email,
    role: user.role,
    isActive: user.isActive,
    taken: { orders: takenOrders, total: takenTotal, avgTicket: takenOrders ? round2(takenTotal / takenOrders) : 0 },
    served: { orders: servedOrders, total: servedTotal, avgTicket: servedOrders ? round2(servedTotal / servedOrders) : 0 },
    discounts: round2(num(t?._sum.discount)),
    voids: { count: v?._count._all ?? 0, total: round2(num(v?._sum.total)) },
    edits: e?._count._all ?? 0,
    invoiceCollected: round2(num(c?._sum.amount)),
  };
}

export async function employeesReport(db: Db, range: DayRange, role?: string) {
  const [users, m] = await Promise.all([
    db.adminUser.findMany({
      where: { role: role ? role : { in: [...STAFF_REPORT_ROLES] } },
      select: { id: true, name: true, email: true, role: true, isActive: true },
      orderBy: { name: 'asc' }, take: USER_CAP,
    }),
    metrics(db, range),
  ]);
  const rows = users
    .map((u) => rowFor(u, m))
    // Inactive accounts only appear when they did something in the range.
    .filter((r) => r.isActive || r.taken.orders || r.served.orders || r.voids.count || r.edits);
  const sum = (f: (r: (typeof rows)[number]) => number) => round2(rows.reduce((s, r) => s + f(r), 0));
  return {
    from: range.fromKey,
    to: range.toKey,
    summary: {
      staff: rows.length,
      salesTaken: sum((r) => r.taken.total),
      voids: rows.reduce((s, r) => s + r.voids.count, 0),
      discounts: sum((r) => r.discounts),
    },
    rows: rows.sort((a, b) => (b.taken.total + b.served.total) - (a.taken.total + a.served.total)),
  };
}

export async function employeeDetail(db: Db, range: DayRange, id: number) {
  const user = await db.adminUser.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true, isActive: true } });
  if (!user) return null;
  const sales = salesWhere(range);
  const [m, takenByDay, servedByDay, byAccount] = await Promise.all([
    metrics(db, range, id),
    db.order.groupBy({ by: ['receiptDay'], where: { ...sales, staffId: id }, _sum: { total: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ['receiptDay'], where: { ...sales, waiterId: id }, _sum: { total: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ['source', 'paymentMethod', 'paymentAccount'], where: { ...sales, staffId: id }, _sum: { total: true }, _count: { _all: true } }),
  ]);
  const t = new Map(takenByDay.map((r) => [r.receiptDay, r]));
  const s = new Map(servedByDay.map((r) => [r.receiptDay, r]));
  const byDay = [];
  for (let d = range.fromKey; d <= range.toKey; d = addDays(d, 1)) {
    byDay.push({
      day: d,
      takenOrders: t.get(d)?._count._all ?? 0, taken: round2(num(t.get(d)?._sum.total)),
      servedOrders: s.get(d)?._count._all ?? 0, served: round2(num(s.get(d)?._sum.total)),
    });
  }
  const accounts = new Map<string, { key: string; label: string; orders: number; total: number }>();
  for (const r of byAccount) {
    const key = accountKey(r);
    const cur = accounts.get(key) ?? { key, label: accountLabel(key), orders: 0, total: 0 };
    cur.orders += r._count._all;
    cur.total = round2(cur.total + num(r._sum.total));
    accounts.set(key, cur);
  }
  return {
    from: range.fromKey,
    to: range.toKey,
    employee: rowFor(user, m),
    byDay,
    byAccount: [...accounts.values()].sort((a, b) => b.total - a.total),
  };
}
