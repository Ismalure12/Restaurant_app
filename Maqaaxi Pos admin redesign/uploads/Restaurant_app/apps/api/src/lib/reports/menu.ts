// Menu report: what sold — quantity and revenue per dish and per category over
// the range — and which active dishes never sold. Built on OrderItem rows (the
// cart lines as data), for the same orders every sales figure counts
// (salesWhere: closed in the range, not voided). Line revenue is the price
// before any order-level discount.
import type { Db } from '../db/prisma.js';
import type { DayRange } from '../time/businessTime.js';
import type { Prisma } from '@prisma/client';
import { num, round2, salesWhere } from './common.js';

const TOP = 500;

export async function menuReport(db: Db, range: DayRange, opts: { category?: string; orderFilter?: Prisma.OrderWhereInput } = {}) {
  const { category, orderFilter } = opts;
  const [rows, active] = await Promise.all([
    db.orderItem.groupBy({
      by: ['menuItemId', 'name', 'categoryName'],
      where: { order: { ...salesWhere(range), ...(orderFilter ?? {}) }, ...(category ? { categoryName: category } : {}) },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: TOP,
    }),
    db.menuItem.findMany({ where: { isActive: true }, select: { id: true, name: true, category: { select: { name: true } } }, take: 2000 }),
  ]);

  // A dish renamed mid-range splits into two groups by name — merge by menu item.
  const byDish = new Map<string, { menuItemId: number | null; name: string; category: string; quantity: number; revenue: number }>();
  for (const r of rows) {
    const key = r.menuItemId != null ? `id:${r.menuItemId}` : `name:${r.name}`;
    const cur = byDish.get(key) ?? { menuItemId: r.menuItemId, name: r.name, category: r.categoryName ?? 'Uncategorised', quantity: 0, revenue: 0 };
    cur.quantity += num(r._sum.quantity);
    cur.revenue = round2(cur.revenue + num(r._sum.lineTotal));
    byDish.set(key, cur);
  }
  const totalRevenue = round2([...byDish.values()].reduce((s, d) => s + d.revenue, 0));
  const items = [...byDish.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((d) => ({ ...d, share: totalRevenue > 0 ? round2((d.revenue / totalRevenue) * 100) : 0 }));

  const byCategory = new Map<string, { category: string; quantity: number; revenue: number; dishes: number }>();
  for (const d of items) {
    const cur = byCategory.get(d.category) ?? { category: d.category, quantity: 0, revenue: 0, dishes: 0 };
    cur.quantity += d.quantity;
    cur.revenue = round2(cur.revenue + d.revenue);
    cur.dishes += 1;
    byCategory.set(d.category, cur);
  }
  const categories = [...byCategory.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((c) => ({ ...c, share: totalRevenue > 0 ? round2((c.revenue / totalRevenue) * 100) : 0 }));

  const sold = new Set(items.map((d) => d.menuItemId).filter((id): id is number => id != null));
  const categoryOptions = [...new Set(active.map((m) => m.category.name))].sort((a, b) => a.localeCompare(b));
  const neverSold = active.filter((m) => !sold.has(m.id) && (!category || m.category.name === category)).map((m) => ({ id: m.id, name: m.name, category: m.category.name }));

  return {
    from: range.fromKey,
    to: range.toKey,
    days: range.days,
    totals: { quantity: items.reduce((s, d) => s + d.quantity, 0), revenue: totalRevenue, dishes: items.length },
    truncated: rows.length === TOP,
    category: category ?? null,
    categoryOptions,
    items,
    categories,
    neverSold,
  };
}
