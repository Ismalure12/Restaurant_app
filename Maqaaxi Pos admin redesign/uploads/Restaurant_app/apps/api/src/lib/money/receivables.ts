// What customers owe on account right now: every non-void invoice's total
// minus what was paid against it. Owned by Customers (Owing); the Sales report
// and Overview only quote it.
import type { Db } from '../db/prisma.js';
import { num, round2 } from '../reports/common.js';

export async function outstandingReceivables(db: Db, customerId?: number) {
  const agg = await db.invoice.aggregate({
    where: { status: { not: 'void' }, ...(customerId ? { customerId } : {}) },
    _sum: { total: true, amountPaid: true },
  });
  const owing = await db.invoice.count({ where: { status: { in: ['unpaid', 'partial'] }, ...(customerId ? { customerId } : {}) } });
  return { owed: Math.max(0, round2(num(agg._sum.total) - num(agg._sum.amountPaid))), openInvoices: owing };
}
