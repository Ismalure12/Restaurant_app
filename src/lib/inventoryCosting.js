// Weighted-average inventory costing. A purchase's unit price fluctuates day
// to day, so we never trust a single stored "cost per unit" for valuation —
// each purchase StockMovement records the TOTAL it actually cost
// (StockMovement.totalCost) for however much was bought, and the effective
// unit cost is derived on read as:
//
//   avgCost = sum(totalCost) / sum(quantity)  across all 'purchase' movements
//
// This is standard moving/weighted-average costing: it blends every purchase
// price ever paid, weighted by how much was bought at each price, and
// updates itself automatically the next time a purchase is logged — no
// field to keep in sync by hand.

/**
 * Returns a Map<inventoryItemId, avgCost|null> — null means the item has no
 * purchase-movement history yet, so the caller should fall back to
 * InventoryItem.costPerUnit (a manual estimate).
 *
 * One groupBy query, never a query per item — safe to call for a whole list.
 */
export async function getAvgCostMap(prisma, itemIds) {
  const where = { type: 'purchase' };
  if (itemIds) {
    if (itemIds.length === 0) return new Map();
    where.inventoryItemId = { in: itemIds };
  }

  const grouped = await prisma.stockMovement.groupBy({
    by: ['inventoryItemId'],
    where,
    _sum: { quantity: true, totalCost: true },
  });

  const map = new Map();
  for (const row of grouped) {
    const qty = Number(row._sum.quantity || 0);
    const cost = Number(row._sum.totalCost || 0);
    map.set(row.inventoryItemId, qty > 0 && cost > 0 ? cost / qty : null);
  }
  return map;
}

/** Single-item convenience wrapper around getAvgCostMap. */
export async function getAvgCost(prisma, inventoryItemId) {
  const map = await getAvgCostMap(prisma, [inventoryItemId]);
  return map.get(inventoryItemId) ?? null;
}

/** avgCost when purchase history exists, else the manual costPerUnit estimate. */
export function effectiveCost(avgCost, costPerUnit) {
  if (avgCost != null) return avgCost;
  return costPerUnit != null ? Number(costPerUnit) : null;
}
