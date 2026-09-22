// Expense categories are rows with a kind (Settings of the books, not free
// text): `operating` costs, `payroll`, or `stock_purchase` (cost of goods —
// counted through Inventory purchases so it never hits the P&L twice).
import type { Prisma } from '@prisma/client';
import type { Db } from '../db/prisma.js';

export const CATEGORY_KINDS = ['operating', 'payroll', 'stock_purchase'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

type Reader = Pick<Db, 'expenseCategory'> | Pick<Prisma.TransactionClient, 'expenseCategory'>;

/** name → kind. A category with no row counts as operating. */
export async function categoryKinds(db: Reader) {
  const rows = await db.expenseCategory.findMany({ select: { name: true, kind: true } });
  return new Map<string, string>((rows ?? []).map((r) => [r.name, r.kind]));
}

/** Makes sure the category exists (new names start as operating); returns its kind. */
export async function ensureCategory(tx: Reader, name: string, kind: CategoryKind = 'operating') {
  const row = await tx.expenseCategory.upsert({ where: { name }, create: { name, kind }, update: {}, select: { kind: true } });
  return (row?.kind ?? kind) as CategoryKind;
}
