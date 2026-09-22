// Inventory report: what is on the shelf now and what it is worth, plus what
// moved in the range (bought, used, wasted, adjusted) and at what cost.
// Valuation uses weighted-average purchase cost (lib/inventory/inventoryCosting.ts),
// falling back to the item's manual cost estimate.
import type { Prisma } from '@prisma/client';
import type { Db } from '../db/prisma.js';
import type { DayRange } from '../time/businessTime.js';
import { getAvgCostMap, effectiveCost } from '../inventory/inventoryCosting.js';
import { num, round2 } from './common.js';

export const MOVEMENT_TYPES = ['purchase', 'usage', 'waste', 'adjustment'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export interface InventoryFilters { itemId?: number; type?: MovementType }

// Restaurants track tens to low hundreds of stock items; this cap only stops
// a runaway table from being read whole.
const ITEM_CAP = 2000;

export async function inventoryReport(db: Db, range: DayRange, f: InventoryFilters) {
  const itemWhere: Prisma.InventoryItemWhereInput = f.itemId ? { id: f.itemId } : {};
  const moveWhere: Prisma.StockMovementWhereInput = {
    createdAt: { gte: range.from, lt: range.to },
    ...(f.itemId ? { inventoryItemId: f.itemId } : {}),
    ...(f.type ? { type: f.type } : {}),
  };

  const [items, avgCost, moves] = await Promise.all([
    db.inventoryItem.findMany({ where: itemWhere, orderBy: { name: 'asc' }, take: ITEM_CAP }),
    getAvgCostMap(db),
    db.stockMovement.groupBy({ by: ['inventoryItemId', 'type'], where: moveWhere, _sum: { quantity: true, totalCost: true }, _count: { _all: true } }),
  ]);

  type Moved = { purchasedQty: number; purchaseCost: number; usedQty: number; wastedQty: number; adjustedQty: number; movements: number };
  const moved = new Map<number, Moved>();
  for (const m of moves) {
    const cur = moved.get(m.inventoryItemId) ?? { purchasedQty: 0, purchaseCost: 0, usedQty: 0, wastedQty: 0, adjustedQty: 0, movements: 0 };
    const q = num(m._sum.quantity);
    cur.movements += m._count._all;
    if (m.type === 'purchase') { cur.purchasedQty += q; cur.purchaseCost += num(m._sum.totalCost); }
    else if (m.type === 'usage') cur.usedQty += Math.abs(q);
    else if (m.type === 'waste') cur.wastedQty += Math.abs(q);
    else cur.adjustedQty += q;
    moved.set(m.inventoryItemId, cur);
  }

  let stockValue = 0;
  let purchases = 0;
  let wasteValue = 0;
  let usageValue = 0;
  const suppliers = new Map<string, { supplier: string; items: number; cost: number }>();
  const rows = items.map((it) => {
    const qty = num(it.quantity);
    const cost = effectiveCost(avgCost.get(it.id), it.costPerUnit);
    const value = cost != null ? round2(Math.max(qty, 0) * cost) : null;
    const reorder = it.reorderLevel != null ? num(it.reorderLevel) : null;
    const status = qty <= 0 ? 'out' : reorder != null && qty <= reorder ? 'low' : 'ok';
    const m = moved.get(it.id);
    stockValue += value ?? 0;
    if (m) {
      purchases += m.purchaseCost;
      if (cost != null) { wasteValue += m.wastedQty * cost; usageValue += m.usedQty * cost; }
      if (m.purchaseCost > 0 || m.purchasedQty > 0) {
        const key = it.supplier?.trim() || 'No supplier';
        const s = suppliers.get(key) ?? { supplier: key, items: 0, cost: 0 };
        s.items += 1;
        s.cost = round2(s.cost + m.purchaseCost);
        suppliers.set(key, s);
      }
    }
    return {
      id: it.id, name: it.name, unit: it.unit, supplier: it.supplier, isActive: it.isActive,
      quantity: qty, reorderLevel: reorder, unitCost: cost != null ? round2(cost) : null, costSource: avgCost.get(it.id) != null ? 'avg' : (cost != null ? 'estimate' : null),
      value, status,
      purchasedQty: m?.purchasedQty ?? 0, purchaseCost: round2(m?.purchaseCost ?? 0),
      usedQty: m?.usedQty ?? 0, wastedQty: m?.wastedQty ?? 0, adjustedQty: m?.adjustedQty ?? 0, movements: m?.movements ?? 0,
    };
  });

  return {
    from: range.fromKey,
    to: range.toKey,
    summary: {
      items: rows.length,
      stockValue: round2(stockValue),
      lowStock: rows.filter((r) => r.status === 'low').length,
      outOfStock: rows.filter((r) => r.status === 'out').length,
      purchases: round2(purchases),
      usageValue: round2(usageValue),
      wasteValue: round2(wasteValue),
    },
    items: rows,
    bySupplier: [...suppliers.values()].sort((a, b) => b.cost - a.cost),
  };
}

// ── Movement ledger ─────────────────────────────────────────────────────
export const MOVEMENT_SELECT = {
  id: true, type: true, quantity: true, totalCost: true, note: true, createdAt: true, onCredit: true,
  supplier: { select: { name: true } },
  inventoryItem: { select: { id: true, name: true, unit: true } },
  staff: { select: { name: true, email: true } },
} satisfies Prisma.StockMovementSelect;

type MoveRow = Prisma.StockMovementGetPayload<{ select: typeof MOVEMENT_SELECT }>;

export function movementRow(m: MoveRow) {
  return {
    id: m.id,
    createdAt: m.createdAt,
    type: m.type,
    itemId: m.inventoryItem.id,
    item: m.inventoryItem.name,
    unit: m.inventoryItem.unit,
    quantity: num(m.quantity),
    totalCost: m.totalCost != null ? round2(num(m.totalCost)) : null,
    note: m.note,
    supplier: m.supplier?.name ?? null,
    onCredit: m.onCredit,
    staff: m.staff ? m.staff.name?.trim() || m.staff.email : null,
  };
}
