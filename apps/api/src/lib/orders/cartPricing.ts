// Server-side cart pricing. Prices always come from the database —
// client-sent unitPrice/total are display-only and never stored.
// Cart line shape: { itemId, name, optionName, extras: [{name, priceAdd}], quantity, ... }
// optionName is the ' · '-joined list of one selected option per option group.
import type { Db } from '../db/prisma.js';

export const toCents = (v: unknown) => Math.round(Number(v) * 100);

export interface CartLineInput {
  itemId: number;
  name?: string;
  optionName?: string | null;
  extras?: { name: string; priceAdd?: number }[];
  quantity: number;
  [key: string]: unknown;
}

export interface PricedLine extends CartLineInput {
  extras: { name: string; priceAdd: number }[];
  unitPrice: number;
}

export type PriceCartResult =
  | { lines: PricedLine[]; totalCents: number; error?: undefined }
  | { error: string; lines?: undefined; totalCents?: undefined };

/**
 * Recomputes every line's unitPrice and the cart total from MenuItem /
 * ItemOption / ItemExtra rows. Returns { lines, totalCents } with lines
 * normalized to DB prices, or { error } when the cart references items,
 * options, or extras that don't exist (or are inactive) anymore.
 */
export async function priceCart(prisma: Db, cartLines: CartLineInput[]): Promise<PriceCartResult> {
  if (cartLines.some((l) => !l.itemId)) return { error: 'Cart contains an invalid item' };
  const itemIds = [...new Set(cartLines.map((l) => l.itemId))];

  const items = await prisma.menuItem.findMany({
    where: { id: { in: itemIds }, isActive: true },
    include: {
      optionGroups: { include: { options: true } },
      extras: true,
    },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  const lines: PricedLine[] = [];
  let totalCents = 0;

  for (const line of cartLines) {
    const item = byId.get(line.itemId);
    if (!item) return { error: `"${line.name}" is no longer available` };

    let unitCents = toCents(item.price);

    if (line.optionName) {
      const allOptions = item.optionGroups.flatMap((g) => g.options);
      for (const part of line.optionName.split(' · ')) {
        const opt = allOptions.find((o) => o.name === part);
        if (!opt) return { error: `Option "${part}" for "${item.name}" is no longer available` };
        unitCents += toCents(opt.priceAdd);
      }
    }

    const extras: { name: string; priceAdd: number }[] = [];
    for (const ex of line.extras || []) {
      const dbExtra = item.extras.find((e) => e.name === ex.name);
      if (!dbExtra) return { error: `Extra "${ex.name}" for "${item.name}" is no longer available` };
      unitCents += toCents(dbExtra.priceAdd);
      extras.push({ name: dbExtra.name, priceAdd: Number(dbExtra.priceAdd) });
    }

    totalCents += unitCents * line.quantity;
    lines.push({ ...line, extras, unitPrice: unitCents / 100 });
  }

  return { lines, totalCents };
}
