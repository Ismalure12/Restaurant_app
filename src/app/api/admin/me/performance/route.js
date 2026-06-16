import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePos } from '@/lib/auth';

// The signed-in user's own performance — orders they rang up (staffId) or were
// attributed as the serving waiter (waiterId). Returns only the caller's data.
export async function GET() {
  const auth = await requirePos(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const uid = auth.session.userId;

  try {
    const now = new Date();
    const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
    const startWeek = new Date(now); startWeek.setDate(now.getDate() - 6); startWeek.setHours(0, 0, 0, 0);

    const orders = await prisma.order.findMany({
      where: { paymentStatus: 'paid', OR: [{ staffId: uid }, { waiterId: uid }] },
      orderBy: { createdAt: 'desc' },
      select: { id: true, reference: true, total: true, orderType: true, tableNumber: true, createdAt: true },
      take: 500,
    });

    let totalSales = 0, todayOrders = 0, todaySales = 0, weekOrders = 0, weekSales = 0;
    for (const o of orders) {
      const t = Number(o.total);
      totalSales += t;
      if (o.createdAt >= startToday) { todayOrders += 1; todaySales += t; }
      if (o.createdAt >= startWeek) { weekOrders += 1; weekSales += t; }
    }

    return NextResponse.json({
      totalOrders: orders.length,
      totalSales,
      todayOrders, todaySales,
      weekOrders, weekSales,
      recent: orders.slice(0, 10).map((o) => ({
        id: o.id, reference: o.reference, total: Number(o.total),
        orderType: o.orderType, tableNumber: o.tableNumber, createdAt: o.createdAt,
      })),
    });
  } catch (err) {
    console.error('GET /api/admin/me/performance:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
