import type { Request, Response } from 'express';
import prisma from '../../lib/db/prisma.js';
import { getSessionWithRole, POS_ROLES } from '../../lib/auth/auth.js';
import { loadMatrix, levelIn, atLeast } from '../../lib/auth/permissions.js';
import { stuckWhere } from '../../lib/payments/paymentReconciler.js';
import { unclosedDays } from '../../lib/closing/dayClose.js';
import { dayKey } from '../../lib/time/businessTime.js';

// GET /api/admin/nav-counts — the numbers behind the sidebar badges and the
// topbar bell: online orders waiting, stuck online payments, unpaid tabs, low
// / out-of-stock items and finished days not closed yet. Counts only (never a
// list), and each group is included only when the caller may view the page it
// belongs to — a waiter never learns the stock or cash state. One permission
// read for the whole call.
const STOCK_CAP = 1000;

export async function getNavCounts(req: Request, res: Response) {
  const session = await getSessionWithRole(prisma, req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (!POS_ROLES.includes(session.role as string)) return res.status(403).json({ error: 'Forbidden' });

  try {
    const matrix = session.role === 'admin' ? null : await loadMatrix(prisma);
    const can = (pages: string[]) => session.role === 'admin' || pages.some((p) => atLeast(levelIn(matrix!, session.role, p), 'view'));

    const now = new Date();
    const [orders, tables, stock, days] = await Promise.all([
      can(['orders'])
        ? Promise.all([
          prisma.order.count({ where: { status: 'pending' } }),
          prisma.paymentSession.count({ where: stuckWhere(now) }),
        ])
        : null,
      can(['tables', 'orders']) ? prisma.order.count({ where: { status: 'open' } }) : null,
      // Prisma can't compare two columns, so read the (small) tracked list.
      can(['inventory'])
        ? prisma.inventoryItem.findMany({
          where: { isActive: true, reorderLevel: { not: null } },
          select: { quantity: true, reorderLevel: true },
          take: STOCK_CAP,
        })
        : null,
      can(['cash']) ? unclosedDays(prisma, dayKey(now)) : null,
    ]);

    const out: Record<string, unknown> = {};
    if (orders) { out.pending = orders[0]; out.stuckPayments = orders[1]; }
    if (tables != null) out.openTabs = tables;
    if (stock) {
      out.lowStock = stock.filter((i) => Number(i.quantity) <= Number(i.reorderLevel)).length;
      out.outOfStock = stock.filter((i) => Number(i.quantity) <= 0).length;
    }
    if (days) { out.unclosedDays = days.days.length; out.oldestUnclosed = days.days[0] ?? null; }
    return res.json(out);
  } catch (err) {
    console.error('GET /api/admin/nav-counts:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
