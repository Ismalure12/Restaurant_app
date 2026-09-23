import type { Request, Response } from 'express';
import prisma from '../../lib/db/prisma.js';
import { requirePos } from '../../lib/auth/auth.js';
import { rangeFromQuery } from '../../lib/time/businessTime.js';
import { filtersWhere, num, round2, salesWhere } from '../../lib/reports/common.js';
import { formatOrderCode, getOrderPrefix } from '../../lib/orders/orderCode.js';
import { formatReceiptNo } from '../../lib/orders/receiptNo.js';
import { collectionsOn } from '../../lib/money/moneyReads.js';
import { currentMonth, prevMonth, salaryFor } from '../../lib/money/salary.js';
import { monthLabel, serializeSalary } from './payroll.controller.js';

// GET /api/admin/me/performance — the signed-in user's own numbers: sales
// they rang up (staffId) or served as the waiter (waiterId), for today, the
// last 7 days and all time. "Today" is the restaurant's local day
// (BUSINESS_TZ), and a sale counts on the day it closed. Plus what they took
// from customers today, per business account (their A/C, E/d, My Cash, cash)
// — all of it handed over at the day's end. Only the caller's data.
export async function getMyPerformance(req: Request, res: Response) {
  const auth = await requirePos(prisma, req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const mine = filtersWhere({ personId: auth.session.userId });

  try {
    const today = rangeFromQuery(null, null, { defaultDays: 1 }).range!;
    const week = rangeFromQuery(null, null, { defaultDays: 7 }).range!;
    const allTime = { status: { in: ['pending', 'confirmed'] }, closedAt: { not: null }, OR: [{ paymentStatus: 'paid' }, { paymentMethod: 'invoice' }], ...mine };

    const [t, w, all, recent, prefix, collected] = await Promise.all([
      prisma.order.aggregate({ where: { ...salesWhere(today), ...mine }, _sum: { total: true }, _count: { _all: true } }),
      prisma.order.aggregate({ where: { ...salesWhere(week), ...mine }, _sum: { total: true }, _count: { _all: true } }),
      prisma.order.aggregate({ where: allTime, _sum: { total: true }, _count: { _all: true } }),
      prisma.order.findMany({
        where: allTime, orderBy: [{ closedAt: 'desc' }, { id: 'desc' }], take: 10,
        select: { id: true, receiptNo: true, total: true, orderType: true, tableNumber: true, createdAt: true, closedAt: true },
      }),
      getOrderPrefix(prisma),
      collectionsOn(prisma, today.fromKey, auth.session.userId),
    ]);
    const mineToday = collected.rows[0];

    return res.json({
      totalOrders: all._count._all,
      totalSales: round2(num(all._sum.total)),
      todayOrders: t._count._all,
      todaySales: round2(num(t._sum.total)),
      weekOrders: w._count._all,
      weekSales: round2(num(w._sum.total)),
      collectedToday: {
        accounts: collected.accounts.map((a) => ({ id: a.id, label: a.label, kind: a.kind, amount: mineToday?.byAccount[a.id] ?? 0 })),
        total: mineToday?.total ?? 0,
      },
      recent: recent.map((o) => ({
        id: o.id, code: formatOrderCode(o, prefix), receiptNo: formatReceiptNo(o.receiptNo),
        total: Number(o.total), orderType: o.orderType, tableNumber: o.tableNumber, createdAt: o.closedAt ?? o.createdAt,
      })),
    });
  } catch (err) {
    console.error('GET /api/admin/me/performance:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/me/salary — the signed-in staff member's own salary: this
// month's amount (from salary history) and this and last month's payments.
// Returns only the caller's record.
export async function getMySalary(req: Request, res: Response) {
  const auth = await requirePos(prisma, req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const uid = auth.session.userId!;

  try {
    const month = currentMonth();
    const prev = prevMonth(month);
    const [rates, payments] = await Promise.all([
      prisma.salaryRate.findMany({ where: { staffId: uid }, select: { amount: true, fromMonth: true } }),
      prisma.salaryPayment.findMany({ where: { staffId: uid, month: { in: [month, prev] } }, include: { paidBy: { select: { name: true, email: true } } } }),
    ]);
    const find = (mm: string) => payments.find((p) => p.month === mm);
    return res.json({
      salary: salaryFor(rates, month),
      months: [month, prev].map((mm) => ({ month: mm, label: monthLabel(mm), payment: find(mm) ? serializeSalary(find(mm)!) : null })),
    });
  } catch (err) {
    console.error('GET /api/admin/me/salary:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
