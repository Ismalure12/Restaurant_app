// What we owe suppliers: purchases bought on credit minus what was paid them.
// A paid-now purchase never creates a debt (it books an expense and a cash-book
// row); a credit purchase books neither until a SupplierPayment settles it.
import type { Db } from '../db/prisma.js';
import { num, round2 } from '../reports/common.js';

/** Every supplier's balance owed right now (`asOf` = the instant to measure at; default: now). */
export async function supplierBalances(db: Db, asOf?: Date) {
  const cut = asOf ? { lt: asOf } : undefined;
  const [bought, paid] = await Promise.all([
    db.stockMovement.groupBy({
      by: ['supplierId'],
      where: { type: 'purchase', onCredit: true, supplierId: { not: null }, ...(cut ? { createdAt: cut } : {}) },
      _sum: { totalCost: true },
    }),
    db.supplierPayment.groupBy({ by: ['supplierId'], where: cut ? { paidAt: cut } : {}, _sum: { amount: true } }),
  ]);
  const owed = new Map<number, number>();
  for (const b of bought) if (b.supplierId != null) owed.set(b.supplierId, num(b._sum.totalCost));
  for (const p of paid) owed.set(p.supplierId, round2((owed.get(p.supplierId) ?? 0) - num(p._sum.amount)));
  return owed;
}

/** Total owed to all suppliers at `asOf` (never below zero per supplier). */
export async function supplierOwedAt(db: Db, asOf: Date) {
  const owed = await supplierBalances(db, asOf);
  return round2([...owed.values()].reduce((s, v) => s + Math.max(0, v), 0));
}
