// Order lines as rows (OrderItem) — kept in step with Order.items (the JSON
// receipts and kitchen tickets read). Every path that creates or changes an
// order's lines calls one of these inside the same transaction, so a report
// never sees a sale without its lines. `menuItemId` and `categoryName` are
// snapshots, resolved with ONE query for the whole cart.
import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export interface CartLine {
  itemId?: number | string | null;
  name?: string;
  optionName?: string | null;
  extras?: { name: string; priceAdd: number }[] | null;
  unitPrice?: number | string;
  quantity?: number | string;
}

const toCents = (n: unknown) => Math.round(Number(n || 0) * 100);

async function rows(tx: Tx, orderId: number, lines: CartLine[]): Promise<Prisma.OrderItemCreateManyInput[]> {
  const ids = [...new Set(lines.map((l) => Number(l.itemId)).filter((n) => Number.isInteger(n) && n > 0))];
  const menu = ids.length
    ? await tx.menuItem.findMany({ where: { id: { in: ids } }, select: { id: true, category: { select: { name: true } } } })
    : [];
  const byId = new Map(menu.map((m) => [m.id, m]));
  return lines.map((l) => {
    const qty = Math.max(1, Math.floor(Number(l.quantity) || 1));
    const unit = toCents(l.unitPrice);
    const item = byId.get(Number(l.itemId));
    return {
      orderId,
      menuItemId: item ? item.id : null,
      name: l.name || 'Item',
      categoryName: item?.category?.name ?? null,
      optionName: l.optionName || null,
      extras: l.extras && l.extras.length ? (l.extras as unknown as Prisma.InputJsonValue) : undefined,
      unitPrice: unit / 100,
      quantity: qty,
      lineTotal: (unit * qty) / 100,
    };
  });
}

/** A new order's lines. */
export async function writeOrderItems(tx: Tx, orderId: number, lines: CartLine[]) {
  if (!lines.length) return;
  await tx.orderItem.createMany({ data: await rows(tx, orderId, lines) });
}

/** A manager's edit replaced the whole cart. */
export async function replaceOrderItems(tx: Tx, orderId: number, lines: CartLine[]) {
  await tx.orderItem.deleteMany({ where: { orderId } });
  await writeOrderItems(tx, orderId, lines);
}
