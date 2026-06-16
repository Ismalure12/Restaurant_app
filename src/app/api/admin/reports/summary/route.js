import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

const REPORT_ROLES = ['admin', 'manager'];

export async function GET(request) {
  const auth = await requireRole(prisma, REPORT_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const toParam = searchParams.get('to');
  const to = toParam ? new Date(toParam) : new Date();
  const from = searchParams.get('from') ? new Date(searchParams.get('from')) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
  }
  // A date-only `to` (YYYY-MM-DD) parses as UTC midnight; extend to end-of-day so
  // `lte: to` includes the whole final day instead of dropping it.
  if (toParam) to.setUTCHours(23, 59, 59, 999);

  try {
    const orders = await prisma.order.findMany({
      where: { paymentStatus: 'paid', createdAt: { gte: from, lte: to } },
      select: { source: true, total: true, staffId: true, waiterId: true, items: true },
    });

    // Orders by channel (manual = pos, digital = online).
    const bySource = { online: { count: 0, total: 0 }, pos: { count: 0, total: 0 } };
    // Items sold (from the cart Json).
    const itemMap = new Map(); // name -> { qty, total }
    // Per-waiter + per-cashier aggregates.
    const waiterAgg = new Map(); // waiterId|null -> { orders, total }
    const staffAgg = new Map();  // staffId|null -> { orders, total }

    for (const o of orders) {
      const total = Number(o.total);
      const bucket = o.source === 'pos' ? bySource.pos : bySource.online;
      bucket.count += 1; bucket.total += total;

      const lines = Array.isArray(o.items) ? o.items : [];
      for (const l of lines) {
        const name = l.name || 'Item';
        const cur = itemMap.get(name) || { qty: 0, total: 0 };
        cur.qty += l.quantity || 1;
        cur.total += Number(l.unitPrice || 0) * (l.quantity || 1);
        itemMap.set(name, cur);
      }

      if (o.source === 'pos') {
        const wk = o.waiterId ?? 'none';
        const w = waiterAgg.get(wk) || { waiterId: o.waiterId ?? null, orders: 0, total: 0 };
        w.orders += 1; w.total += total; waiterAgg.set(wk, w);
      }

      const sk = o.staffId ?? 'none';
      const s = staffAgg.get(sk) || { staffId: o.staffId ?? null, orders: 0, total: 0 };
      s.orders += 1; s.total += total; staffAgg.set(sk, s);
    }

    // Resolve names.
    const waiterIds = [...waiterAgg.values()].map((w) => w.waiterId).filter((x) => x != null);
    const staffIds = [...staffAgg.values()].map((s) => s.staffId).filter((x) => x != null);
    const [waiterRows, staffRows] = await Promise.all([
      waiterIds.length ? prisma.adminUser.findMany({ where: { id: { in: waiterIds } }, select: { id: true, name: true, email: true } }) : [],
      staffIds.length ? prisma.adminUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true, email: true } }) : [],
    ]);
    const waiterName = Object.fromEntries(waiterRows.map((w) => [w.id, w.name || w.email]));
    const staffName = Object.fromEntries(staffRows.map((s) => [s.id, s.name || s.email]));

    const allItems = [...itemMap.entries()].map(([name, v]) => ({ name, qty: v.qty, total: v.total }));
    const itemsSold = [...allItems].sort((a, b) => b.qty - a.qty).slice(0, 20);
    const totalUnits = allItems.reduce((sum, i) => sum + i.qty, 0);

    const waiterPerformance = [...waiterAgg.values()]
      .map((w) => ({ waiterId: w.waiterId, name: w.waiterId == null ? 'Unassigned' : (waiterName[w.waiterId] || `Waiter #${w.waiterId}`), orders: w.orders, total: w.total }))
      .sort((a, b) => b.total - a.total);

    const salesByStaff = [...staffAgg.values()]
      .map((s) => ({ staffId: s.staffId, name: s.staffId == null ? 'Online / unattributed' : (staffName[s.staffId] || `Staff #${s.staffId}`), orders: s.orders, total: s.total }))
      .sort((a, b) => b.total - a.total);

    return NextResponse.json({
      from, to,
      ordersBySource: bySource,
      totalOrders: bySource.online.count + bySource.pos.count,
      itemsSoldUnits: totalUnits,
      itemsSold,
      waiterPerformance,
      salesByStaff,
    });
  } catch (err) {
    console.error('GET /api/admin/reports/summary:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
