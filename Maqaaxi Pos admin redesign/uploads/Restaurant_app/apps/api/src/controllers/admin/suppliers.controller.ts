import type { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { readJson } from '../../utils/body.js';
import { supplierBalances } from '../../lib/money/suppliers.js';
import { audit } from '../../lib/db/audit.js';
import { round2, num } from '../../lib/reports/common.js';
import { checkPaidFrom } from '../../lib/money/cashBook.js';
import { assertOpenAt, sendHttpError } from '../../lib/closing/dayClose.js';
import { httpError } from '../../utils/httpError.js';
import { dayKey } from '../../lib/time/businessTime.js';

// GET  /api/admin/suppliers — suppliers with what is owed to each (credit
//      purchases minus payments made) and the total owed. Manager tier.
// POST /api/admin/suppliers — add a supplier.
export const supplierFields = {
  name: z.string().trim().min(1, 'Give the supplier a name').max(80, 'Name is too long (max 80)'),
  phone: z.string().trim().max(40, 'Phone is too long').nullable().optional(),
};
const createSchema = z.object(supplierFields);
const errCode = (e: unknown) => (e as { code?: string } | null)?.code;

export async function listSuppliers(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'expenses', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    const [suppliers, owed] = await Promise.all([
      prisma.supplier.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }], take: 500 }),
      supplierBalances(prisma),
    ]);
    const rows = suppliers.map((s) => ({ id: s.id, name: s.name, phone: s.phone, isActive: s.isActive, owed: round2(owed.get(s.id) ?? 0) }));
    return res.json({ suppliers: rows, totalOwed: round2(rows.reduce((t, r) => t + Math.max(0, r.owed), 0)) });
  } catch (err) {
    console.error('GET /api/admin/suppliers:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createSupplier(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'expenses', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  try {
    const supplier = await prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({ data: { name: parsed.data.name, phone: parsed.data.phone || null } });
      await audit(tx, auth.session.userId, 'supplier.create', 'Supplier', created.id, { name: created.name });
      return created;
    });
    return res.status(201).json({ id: supplier.id, name: supplier.name, phone: supplier.phone, isActive: supplier.isActive, owed: 0 });
  } catch (err) {
    if (errCode(err) === 'P2002') return res.status(409).json({ error: 'A supplier with that name already exists' });
    console.error('POST /api/admin/suppliers:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/suppliers/:id — one supplier: what is owed, the credit
//     purchases and the payments made (newest first, bounded). Manager tier.
// PUT /api/admin/suppliers/:id — rename, change the phone, or switch off.
const updateSchema = z.object({ ...supplierFields, isActive: z.boolean() }).partial();
const parseId = (raw: string) => { const n = parseInt(raw, 10); return Number.isFinite(n) && n > 0 ? n : null; };

export async function getSupplier(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'expenses', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    const [owed, purchases, payments] = await Promise.all([
      supplierBalances(prisma),
      prisma.stockMovement.findMany({
        where: { supplierId: id, type: 'purchase', onCredit: true }, orderBy: { createdAt: 'desc' }, take: 100,
        select: { id: true, createdAt: true, quantity: true, totalCost: true, note: true, inventoryItem: { select: { name: true, unit: true } } },
      }),
      prisma.supplierPayment.findMany({
        where: { supplierId: id }, orderBy: { paidAt: 'desc' }, take: 100,
        select: { id: true, amount: true, paidAt: true, note: true, account: { select: { label: true } }, paidBy: { select: { name: true, email: true } } },
      }),
    ]);
    return res.json({
      id: supplier.id, name: supplier.name, phone: supplier.phone, isActive: supplier.isActive,
      owed: round2(owed.get(id) ?? 0),
      purchases: purchases.map((p) => ({ id: p.id, at: p.createdAt, item: p.inventoryItem.name, unit: p.inventoryItem.unit, quantity: num(p.quantity), cost: round2(num(p.totalCost)), note: p.note })),
      payments: payments.map((p) => ({ id: p.id, at: p.paidAt, amount: round2(num(p.amount)), account: p.account.label, note: p.note, by: p.paidBy ? p.paidBy.name?.trim() || p.paidBy.email : null })),
    });
  } catch (err) {
    console.error(`GET /api/admin/suppliers/${id}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateSupplier(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'expenses', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  const data = { ...parsed.data, ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}) };
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Nothing to update' });
  try {
    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Supplier not found' });
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.supplier.update({ where: { id }, data });
      await audit(tx, auth.session.userId, 'supplier.update', 'Supplier', id, { before: { name: existing.name, phone: existing.phone, isActive: existing.isActive }, after: data });
      return row;
    });
    return res.json({ id: updated.id, name: updated.name, phone: updated.phone, isActive: updated.isActive });
  } catch (err) {
    if (errCode(err) === 'P2002') return res.status(409).json({ error: 'A supplier with that name already exists' });
    console.error(`PUT /api/admin/suppliers/${id}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/admin/suppliers/:id/payments — pay a supplier what is owed for
// credit purchases: one `supplier_payment` cash-book row (money out of the
// account it came from) in the same transaction. It is not an expense — the
// cost was counted when the stock was bought. Manager tier; audited.
const schema = z.object({
  amount: z.number({ error: 'Enter an amount' }).positive('Amount must be greater than zero').max(100_000_000),
  accountId: z.number({ error: 'Choose which account the money came out of' }).int().positive(),
  note: z.string().trim().max(300).nullable().optional(),
});

export async function paySupplier(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'expenses', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const supplierId = parseInt(req.params.id, 10);
  if (!Number.isFinite(supplierId) || supplierId <= 0) return res.status(400).json({ error: 'Invalid id' });
  let body: unknown;
  try { body = readJson(req); } catch { body = null; }
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
  const { amount, accountId, note } = parsed.data;
  try {
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    const from = await checkPaidFrom(prisma, accountId);
    if (!from.ok) return res.status(400).json({ error: from.error });
    const by = auth.session.userId ?? null;
    const payment = await prisma.$transaction(async (tx) => {
      const now = new Date();
      await assertOpenAt(tx, now);
      // Read inside the transaction so two payments can't both pass the check.
      const owed = (await supplierBalances(tx as unknown as typeof prisma)).get(supplierId) ?? 0;
      if (Math.round(amount * 100) > Math.round(owed * 100)) throw httpError(`${supplier.name} is owed $${owed.toFixed(2)} — you can't pay more than that`, 409);
      const created = await tx.supplierPayment.create({ data: { supplierId, amount, accountId, note: note || null, paidById: by, paidAt: now } });
      await tx.accountEntry.create({
        data: {
          accountId, amount: -amount, kind: 'supplier_payment', businessDay: dayKey(now), occurredAt: now,
          supplierPaymentId: created.id, note: note || `Payment to ${supplier.name}`, createdById: by,
        },
      });
      await audit(tx, by, 'supplier.payment', 'Supplier', supplierId, { amount, accountId });
      return created;
    });
    return res.status(201).json({ id: payment.id, amount, supplierId });
  } catch (err) {
    if (sendHttpError(res, err)) return;
    console.error(`POST /api/admin/suppliers/${supplierId}/payments:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
