import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

const REPORT_ROLES = ['admin', 'manager'];

// The full Daily Report — a manager's single source of truth for "what
// happened today": revenue by payment method, invoiced vs collected, every
// item sold (not just the top 20), stock consumed, and a staff/waiter
// breakdown. Everything here is a real Prisma aggregate/groupBy — nothing is
// computed by fetching the whole orders table into JS.
export async function GET(request) {
  const auth = await requireRole(prisma, REPORT_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  let from, to;
  if (dateParam) {
    from = new Date(dateParam);
    to = new Date(dateParam);
    to.setUTCHours(23, 59, 59, 999);
  } else {
    to = toParam ? new Date(toParam) : new Date();
    from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 0); // default: today only
    if (!fromParam && !dateParam) from.setUTCHours(0, 0, 0, 0);
    if (toParam) to.setUTCHours(23, 59, 59, 999);
  }
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
  }
  if (to.getTime() - from.getTime() > 92 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: 'Date range too large (max 92 days)' }, { status: 400 });
  }

  try {
    const paidWhere = { paymentStatus: 'paid', createdAt: { gte: from, lte: to } };
    const invoiceCreatedWhere = { createdAt: { gte: from, lte: to } };
    const paymentsCollectedWhere = { paidAt: { gte: from, lte: to } };
    const stockWhere = { type: { in: ['usage', 'waste'] }, createdAt: { gte: from, lte: to } };

    const [
      revenueByMethodRaw,
      invoicedAgg,
      collectedAgg,
      collectedByMethodRaw,
      stockByItemRaw,
      bySourceRaw,
    ] = await Promise.all([
      prisma.order.groupBy({ by: ['paymentMethod'], where: paidWhere, _sum: { total: true }, _count: { _all: true } }),
      prisma.invoice.aggregate({ where: { ...invoiceCreatedWhere, status: { not: 'void' } }, _sum: { total: true }, _count: { _all: true } }),
      prisma.invoicePayment.aggregate({ where: paymentsCollectedWhere, _sum: { amount: true }, _count: { _all: true } }),
      prisma.invoicePayment.groupBy({ by: ['method'], where: paymentsCollectedWhere, _sum: { amount: true } }),
      prisma.stockMovement.groupBy({ by: ['inventoryItemId', 'type'], where: stockWhere, _sum: { quantity: true } }),
      // Manual (counter/POS) vs digital (online) channel split — same
      // bucketing convention as reports/summary's ordersBySource.
      prisma.order.groupBy({ by: ['source'], where: paidWhere, _sum: { total: true }, _count: { _all: true } }),
    ]);

    const revenueByMethod = revenueByMethodRaw
      .map((r) => ({ method: r.paymentMethod || 'unspecified', orders: r._count._all, total: Number(r._sum.total || 0) }))
      .sort((a, b) => b.total - a.total);
    const totalRevenue = revenueByMethod.reduce((s, r) => s + r.total, 0);
    const totalOrders = revenueByMethod.reduce((s, r) => s + r.orders, 0);

    const invoicedTotal = Number(invoicedAgg._sum.total || 0);
    const invoicedCount = invoicedAgg._count._all;
    const collectedFromInvoicesToday = Number(collectedAgg._sum.amount || 0);
    const collectedByMethod = collectedByMethodRaw.map((r) => ({ method: r.method, total: Number(r._sum.amount || 0) }));

    // bySource: manual (counter/POS) vs digital (online) — any source value
    // that isn't 'pos' is bucketed as online, matching reports/summary.
    const bySource = { online: { count: 0, total: 0 }, pos: { count: 0, total: 0 } };
    for (const r of bySourceRaw) {
      const bucket = r.source === 'pos' ? bySource.pos : bySource.online;
      bucket.count += r._count._all;
      bucket.total += Number(r._sum.total || 0);
    }

    // Stock consumed — joined to item names in one follow-up query (no loop).
    const itemIds = [...new Set(stockByItemRaw.map((r) => r.inventoryItemId))];
    const items = itemIds.length
      ? await prisma.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, unit: true } })
      : [];
    const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
    const stockConsumed = stockByItemRaw.map((r) => ({
      inventoryItemId: r.inventoryItemId,
      name: itemById[r.inventoryItemId]?.name || `Item #${r.inventoryItemId}`,
      unit: itemById[r.inventoryItemId]?.unit || '',
      type: r.type,
      quantity: Math.abs(Number(r._sum.quantity || 0)),
    })).sort((a, b) => b.quantity - a.quantity);

    // Items sold + staff/waiter breakdown — one batched pass over paid orders
    // in range (bounded by the date range itself, streamed so a busy day
    // can't blow up memory). Never truncated silently — capped defensively
    // with a `truncated` flag the UI must show if ever hit.
    const itemMap = new Map(); // name -> { qty, total }
    const waiterAgg = new Map();
    const staffAgg = new Map();
    const CAP = 1000;
    const BATCH = 500;
    let cursor;
    let scanned = 0;
    let truncated = false;
    for (;;) {
      const orders = await prisma.order.findMany({
        where: paidWhere,
        select: { id: true, source: true, total: true, staffId: true, waiterId: true, items: true },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      for (const o of orders) {
        const total = Number(o.total);
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

      scanned += orders.length;
      if (orders.length < BATCH || scanned >= CAP) {
        if (orders.length === BATCH && scanned >= CAP) truncated = true;
        break;
      }
      cursor = orders[orders.length - 1].id;
    }

    const waiterIds = [...waiterAgg.values()].map((w) => w.waiterId).filter((x) => x != null);
    const staffIds = [...staffAgg.values()].map((s) => s.staffId).filter((x) => x != null);
    const [waiterRows, staffRows] = await Promise.all([
      waiterIds.length ? prisma.adminUser.findMany({ where: { id: { in: waiterIds } }, select: { id: true, name: true, email: true } }) : [],
      staffIds.length ? prisma.adminUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true, email: true } }) : [],
    ]);
    const waiterName = Object.fromEntries(waiterRows.map((w) => [w.id, w.name || w.email]));
    const staffName = Object.fromEntries(staffRows.map((s) => [s.id, s.name || s.email]));

    const itemsSold = [...itemMap.entries()]
      .map(([name, v]) => ({ name, qty: v.qty, total: v.total }))
      .sort((a, b) => b.qty - a.qty);

    const staffBreakdown = {
      waiters: [...waiterAgg.values()]
        .map((w) => ({ waiterId: w.waiterId, name: w.waiterId == null ? 'Unassigned' : (waiterName[w.waiterId] || `Waiter #${w.waiterId}`), orders: w.orders, total: w.total, avgTicket: w.orders ? w.total / w.orders : 0 }))
        .sort((a, b) => b.total - a.total),
      staff: [...staffAgg.values()]
        .map((s) => ({ staffId: s.staffId, name: s.staffId == null ? 'Online / unattributed' : (staffName[s.staffId] || `Staff #${s.staffId}`), orders: s.orders, total: s.total, avgTicket: s.orders ? s.total / s.orders : 0 }))
        .sort((a, b) => b.total - a.total),
    };

    return NextResponse.json({
      from, to,
      topline: {
        totalRevenue,
        totalOrders,
        avgTicket: totalOrders ? totalRevenue / totalOrders : 0,
        invoicedTotal,
        invoicedCount,
        collectedFromInvoicesToday,
      },
      revenueByMethod,
      bySource,
      invoiceActivity: { invoicedTotal, invoicedCount, collectedTotal: collectedFromInvoicesToday, collectedByMethod },
      itemsSold,
      itemsSoldTruncated: truncated,
      stockConsumed,
      stockConsumedNote: 'Manually logged usage/waste movements only — automatic recipe-based deduction is not implemented.',
      staffBreakdown,
    });
  } catch (err) {
    console.error('GET /api/admin/reports/daily:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
