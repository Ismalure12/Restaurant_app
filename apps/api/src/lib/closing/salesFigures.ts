// Sales figures for a period, the way the day close and the month statements
// count them: a sale belongs to the day it CLOSED, and a later void is a
// REFUND on the day it was voided — it never rewrites the day of the sale.
//   gross    = what was rung up (before discounts)
//   discounts
//   refunds  = sales voided in the period (whenever they were sold)
//   net      = gross − discounts − refunds
// A sale voided the same day it closed appears in both gross and refunds, so
// it nets to zero. Pending-decline online orders never became sales.
import type { Db } from '../db/prisma.js';
import { num, round2 } from '../reports/common.js';

export async function salesFigures(db: Db, from: Date, to: Date) {
  const range = { gte: from, lt: to };
  const [stood, onAccount, refunded] = await Promise.all([
    db.order.aggregate({
      where: {
        closedAt: range,
        status: { in: ['pending', 'confirmed', 'voided'] },
        OR: [{ paymentStatus: { in: ['paid', 'refunded'] } }, { paymentMethod: 'invoice' }],
      },
      _sum: { total: true, discount: true },
      _count: { _all: true },
    }),
    db.order.aggregate({
      where: { closedAt: range, status: { in: ['pending', 'confirmed'] }, paymentMethod: 'invoice' },
      _sum: { total: true },
      _count: { _all: true },
    }),
    db.order.aggregate({
      where: { voidedAt: range, status: 'voided', closedAt: { not: null } },
      _sum: { total: true },
      _count: { _all: true },
    }),
  ]);
  const total = num(stood._sum.total);
  const discounts = round2(num(stood._sum.discount));
  const gross = round2(total + discounts);
  const refunds = round2(num(refunded._sum.total));
  return {
    count: stood._count._all,
    gross,
    discounts,
    refunds,
    refundCount: refunded._count._all,
    net: round2(gross - discounts - refunds),
    onAccount: { count: onAccount._count._all, total: round2(num(onAccount._sum.total)) },
  };
}
