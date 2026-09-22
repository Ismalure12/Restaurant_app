import type { Request, Response } from 'express';
import type { InventoryItem } from '@prisma/client';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { inventoryItemSchema, stockMovementSchema } from '../../validations/inventory.validation.js';
import { getAvgCostMap, effectiveCost, getAvgCost } from '../../lib/inventory/inventoryCosting.js';
import { readJson } from '../../utils/body.js';
import { errMessage } from '../../utils/errors.js';
import { checkPaidFrom, syncExpenseEntry } from '../../lib/money/cashBook.js';
import { ensureCategory } from '../../lib/money/expenseCategories.js';

function serialize(item: InventoryItem, avgCost: number | null = null) {
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    quantity: item.quantity.toString(),
    reorderLevel: item.reorderLevel?.toString() ?? null,
    // Manual fallback estimate — see effectiveCost for what's actually used.
    costPerUnit: item.costPerUnit?.toString() ?? null,
    // Weighted-average cost from purchase history, or null if none yet.
    avgCost: avgCost != null ? avgCost.toFixed(2) : null,
    // What valuation/reporting should actually use: avgCost when it exists,
    // else the manual costPerUnit estimate.
    effectiveCost: (() => {
      const c = effectiveCost(avgCost, item.costPerUnit);
      return c != null ? c.toFixed(2) : null;
    })(),
    supplier: item.supplier,
    isActive: item.isActive,
    lowStock: item.reorderLevel != null && Number(item.quantity) <= Number(item.reorderLevel),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export async function listInventory(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'inventory', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  try {
    const items = await prisma.inventoryItem.findMany({ orderBy: { name: 'asc' } });
    const avgCostMap = await getAvgCostMap(prisma, items.map((i) => i.id));
    return res.json(items.map((item) => serialize(item, avgCostMap.get(item.id) ?? null)));
  } catch (err) {
    console.error('GET /api/admin/inventory:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createInventoryItem(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'inventory', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  try {
    const body = readJson(req);
    const parsed = inventoryItemSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }

    const item = await prisma.inventoryItem.create({ data: parsed.data });
    return res.status(201).json(serialize(item));
  } catch (err) {
    console.error('POST /api/admin/inventory:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// `item` is typed non-null to mirror the JS, which dereferences it directly
// (a row deleted between updateMany and findUnique throws → 500, as before).

export async function updateInventoryItem(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'inventory', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { id: rawId } = req.params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const body = readJson(req);
    const parsed = inventoryItemSchema.partial().safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }

    const updated = await prisma.inventoryItem.updateMany({ where: { id }, data: parsed.data });
    if (updated.count === 0) return res.status(404).json({ error: 'Item not found' });

    const item = await prisma.inventoryItem.findUnique({ where: { id } });
    const avgCost = await getAvgCost(prisma, id);
    return res.json(serialize(item as InventoryItem, avgCost));
  } catch (err) {
    console.error('PATCH /api/admin/inventory/[id]:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteInventoryItem(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'inventory', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { id: rawId } = req.params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const deleted = await prisma.inventoryItem.deleteMany({ where: { id } });
    if (deleted.count === 0) return res.status(404).json({ error: 'Item not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/inventory/[id]:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function recordStockMovement(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'inventory', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { id: rawId } = req.params;
  const inventoryItemId = parseInt(rawId, 10);
  if (!Number.isFinite(inventoryItemId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const body = readJson(req);
    const parsed = stockMovementSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }

    const { type, quantity, totalCost, note, paidFromAccountId, supplierId, onCredit } = parsed.data;
    const staffId = auth.session.userId;
    const costed = type === 'purchase' && totalCost != null && totalCost > 0;
    // Bought on credit: nothing is paid now — it is owed to the supplier until a supplier payment settles it.
    if (onCredit) {
      if (type !== 'purchase') return res.status(400).json({ error: 'Only a purchase can be on credit' });
      if (!supplierId) return res.status(400).json({ error: 'Choose the supplier this purchase is owed to' });
      if (!costed) return res.status(400).json({ error: 'Enter what the purchase cost' });
    }
    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, isActive: true }, select: { id: true } });
      if (!supplier) return res.status(400).json({ error: 'That supplier was not found' });
    }
    const paidPurchase = costed && !onCredit;
    let paidFrom: number | null = null;
    if (paidPurchase) {
      const from = await checkPaidFrom(prisma, paidFromAccountId);
      if (!from.ok) return res.status(400).json({ error: from.error });
      paidFrom = from.value;
    }

    // Sign is enforced by type so the ledger can't be corrupted by a bad sign:
    // purchase adds, usage/waste remove, adjustment is taken as-is (signed).
    let delta: number;
    if (type === 'purchase') delta = Math.abs(quantity);
    else if (type === 'usage' || type === 'waste') delta = -Math.abs(quantity);
    else delta = quantity; // adjustment

    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({ where: { id: inventoryItemId } });
      if (!item) throw Object.assign(new Error('Item not found'), { httpStatus: 404 });

      const movement = await tx.stockMovement.create({
        data: {
          inventoryItemId, type, quantity: delta, totalCost: totalCost ?? null, note: note ?? null, staffId,
          ...(type === 'purchase' && supplierId ? { supplierId } : {}),
          ...(onCredit ? { onCredit: true } : {}),
        },
      });

      const updated = await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: { quantity: { increment: delta } },
      });

      // A purchase with a total cost also books a matching expense — the
      // amount actually paid, entered directly (no per-unit multiplication).
      if (paidPurchase) {
        await ensureCategory(tx, 'purchases', 'stock_purchase');
        const expense = await tx.expense.create({
          data: {
            category: 'purchases',
            amount: totalCost!,
            note: note ?? `Stock purchase: ${item.name}`,
            staffId,
            paidFromAccountId: paidFrom,
          },
        });
        await syncExpenseEntry(tx, expense, { createdById: staffId ?? null });
        // Link them, so cost of goods counts this purchase once (as stock, not also as an expense).
        await tx.stockMovement.update({ where: { id: movement.id }, data: { expenseId: expense.id } });
      }

      return { movement, quantity: updated.quantity.toString() };
    });

    return res.status(201).json({ id: result.movement.id, quantity: result.quantity });
  } catch (err) {
    if ((err as { httpStatus?: number } | null)?.httpStatus === 404) return res.status(404).json({ error: errMessage(err) });
    console.error('POST /api/admin/inventory/[id]/movements:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
