// Daily receipt numbers: 0001, 0002, … restarting at local midnight.
//
// Assigned when a sale CLOSES (paid at the till, charged to a customer
// account, or paid online) — an unpaid pay-later order has no receipt yet. The counter row
// is bumped with a single native upsert (INSERT … ON CONFLICT DO UPDATE SET
// last = last + 1), which Postgres serializes per row, so two tills closing
// at the same instant can never get the same number. The unique index on
// orders(receipt_day, receipt_no) backs it up.
import type { Prisma } from '@prisma/client';
import { dayKey } from '../time/businessTime.js';

export async function nextReceiptNo(tx: Prisma.TransactionClient, at: Date = new Date()) {
  const receiptDay = dayKey(at);
  const row = await tx.receiptCounter.upsert({
    where: { day: receiptDay },
    create: { day: receiptDay, last: 1 },
    update: { last: { increment: 1 } },
    select: { last: true },
  });
  return { receiptDay, receiptNo: row.last };
}

export const formatReceiptNo = (n: number | null | undefined) => (n == null ? null : String(n).padStart(4, '0'));
