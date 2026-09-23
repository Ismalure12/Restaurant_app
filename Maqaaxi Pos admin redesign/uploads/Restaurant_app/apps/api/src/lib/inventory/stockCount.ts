// Stock counts (docs/system-blueprint.md §3.5): a stocktake of every active
// item. Posting books each difference as an `adjustment` StockMovement and
// fixes the stock value — counted quantity × weighted-average cost — which is
// the month's closing stock (and the next month's opening). Works without
// recipes: it measures what was actually used.
import type { Db } from '../db/prisma.js';
import { getAvgCostMap, effectiveCost } from './inventoryCosting.js';
import { assertOpenDay } from '../closing/dayClose.js';
import { dayKey } from '../time/businessTime.js';
import { audit } from '../db/audit.js';
import { httpError } from '../../utils/httpError.js';
import { num, round2 } from '../reports/common.js';

const qty3 = (n: number) => Math.round(n * 1000) / 1000;

/** The draft count, or a new one with a line for every active stock item. */
export async function startCount(db: Db, args: { countedOn?: string; userId: number | null }) {
  const today = dayKey(new Date());
  const countedOn = args.countedOn ?? today;
  if (countedOn > today) throw httpError('A stock count cannot be dated in the future', 400);
  const draft = await db.stockCount.findFirst({ where: { status: 'draft' }, orderBy: { id: 'desc' }, select: { id: true } });
  if (draft) return { id: draft.id, created: false };
  return db.$transaction(async (tx) => {
    await assertOpenDay(tx, countedOn);
    const items = await tx.inventoryItem.findMany({ where: { isActive: true }, select: { id: true, quantity: true }, take: 2000 });
    const count = await tx.stockCount.create({ data: { countedOn, createdById: args.userId } });
    if (items.length) {
      await tx.stockCountLine.createMany({ data: items.map((i) => ({ countId: count.id, itemId: i.id, systemQty: i.quantity })) });
    }
    await audit(tx, args.userId, 'stockcount.start', 'StockCount', count.id, { countedOn, items: items.length });
    return { id: count.id, created: true };
  });
}

export async function countDetail(db: Db, id: number) {
  const count = await db.stockCount.findUnique({ where: { id }, include: { lines: true } });
  if (!count) return null;
  const items = await db.inventoryItem.findMany({ where: { id: { in: count.lines.map((l) => l.itemId) } }, select: { id: true, name: true, unit: true, costPerUnit: true, quantity: true } });
  const byId = new Map(items.map((i) => [i.id, i]));
  const costs = count.status === 'draft' ? await getAvgCostMap(db, items.map((i) => i.id)) : new Map<number, number | null>();
  const lines = count.lines
    .map((l) => {
      const item = byId.get(l.itemId);
      const unitCost = l.unitCost != null ? num(l.unitCost) : effectiveCost(costs.get(l.itemId), item?.costPerUnit);
      const counted = l.countedQty == null ? null : num(l.countedQty);
      // A draft compares with stock as it is NOW (sales and purchases keep moving it
      // while the count is open); a posted count keeps what it was compared with.
      const system = count.status === 'draft' && item ? num(item.quantity) : num(l.systemQty);
      return {
        itemId: l.itemId, name: item?.name ?? `Item ${l.itemId}`, unit: item?.unit ?? '',
        systemQty: system, countedQty: counted, unitCost: unitCost == null ? null : round2(unitCost * 100) / 100,
        difference: counted == null ? null : qty3(counted - system),
        // An untouched line counts as matching the system quantity.
        value: unitCost == null ? null : round2((counted ?? system) * unitCost),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const valued = lines.reduce((s, l) => s + (l.value ?? 0), 0);
  return {
    id: count.id, countedOn: count.countedOn, status: count.status, postedAt: count.postedAt,
    totalValue: count.totalValue != null ? round2(num(count.totalValue)) : round2(valued),
    counted: lines.filter((l) => l.countedQty != null).length, total: lines.length, lines,
  };
}

export async function saveLines(db: Db, id: number, lines: { itemId: number; countedQty: number | null }[]) {
  await db.$transaction(async (tx) => {
    const count = await tx.stockCount.findUnique({ where: { id }, select: { status: true } });
    if (!count) throw httpError('Stock count not found', 404);
    if (count.status !== 'draft') throw httpError('This count is already posted', 409);
    const own = await tx.stockCountLine.findMany({ where: { countId: id, itemId: { in: lines.map((l) => l.itemId) } }, select: { itemId: true } });
    if (own.length !== new Set(lines.map((l) => l.itemId)).size) throw httpError('A counted item is not on this sheet', 400);
    // One update per counted line — bounded by the sheet (a restaurant's stock list).
    await Promise.all(lines.map((l) => tx.stockCountLine.update({ where: { countId_itemId: { countId: id, itemId: l.itemId } }, data: { countedQty: l.countedQty } })));
  });
}

export async function postCount(db: Db, id: number, userId: number | null) {
  const pre = await db.stockCount.findUnique({ where: { id }, include: { lines: true } });
  if (!pre) throw httpError('Stock count not found', 404);
  if (pre.status !== 'draft') throw httpError('This count is already posted', 409);
  // A line nobody changed means "it matches": it posts as the stock at the moment
  // of posting — never a stale snapshot that would undo the day's sales/purchases.
  const [items, costs] = await Promise.all([
    db.inventoryItem.findMany({ where: { id: { in: pre.lines.map((l) => l.itemId) } }, select: { id: true, name: true, costPerUnit: true } }),
    getAvgCostMap(db, pre.lines.map((l) => l.itemId)),
  ]);
  const costOf = new Map(items.map((i) => [i.id, effectiveCost(costs.get(i.id), i.costPerUnit)]));

  return db.$transaction(async (tx) => {
    await assertOpenDay(tx, pre.countedOn);
    // Claim the draft first so two posts can't both book the differences.
    const claimed = await tx.stockCount.updateMany({ where: { id, status: 'draft' }, data: { status: 'posted', postedAt: new Date() } });
    if (claimed.count === 0) throw httpError('This count is already posted', 409);
    const current = await tx.inventoryItem.findMany({ where: { id: { in: pre.lines.map((l) => l.itemId) } }, select: { id: true, quantity: true } });
    const nowQty = new Map(current.map((c) => [c.id, num(c.quantity)]));
    const moves: { itemId: number; diff: number }[] = [];
    let total = 0;
    for (const l of pre.lines) {
      const counted = l.countedQty == null ? (nowQty.get(l.itemId) ?? 0) : num(l.countedQty);
      const diff = qty3(counted - (nowQty.get(l.itemId) ?? 0));
      if (diff !== 0) moves.push({ itemId: l.itemId, diff });
      total += counted * (costOf.get(l.itemId) ?? 0);
    }
    if (moves.length) {
      await tx.stockMovement.createMany({
        data: moves.map((m) => ({ inventoryItemId: m.itemId, type: 'adjustment', quantity: m.diff, note: `Stock count ${pre.countedOn}`, staffId: userId })),
      });
      await Promise.all(moves.map((m) => tx.inventoryItem.update({ where: { id: m.itemId }, data: { quantity: { increment: m.diff } } })));
    }
    await Promise.all(pre.lines.map((l) => tx.stockCountLine.update({
      where: { id: l.id },
      data: { systemQty: nowQty.get(l.itemId) ?? l.systemQty, countedQty: l.countedQty ?? nowQty.get(l.itemId) ?? 0, unitCost: costOf.get(l.itemId) ?? null },
    })));
    await tx.stockCount.update({ where: { id }, data: { totalValue: round2(total) } });
    await audit(tx, userId, 'stockcount.post', 'StockCount', id, { countedOn: pre.countedOn, adjustments: moves.length, totalValue: round2(total) });
    return { adjustments: moves.length, totalValue: round2(total) };
  });
}

export async function discardDraft(db: Db, id: number, userId: number | null) {
  await db.$transaction(async (tx) => {
    const gone = await tx.stockCount.deleteMany({ where: { id, status: 'draft' } });
    if (gone.count === 0) throw httpError('Only a draft count can be discarded', 409);
    await audit(tx, userId, 'stockcount.discard', 'StockCount', id);
  });
}
