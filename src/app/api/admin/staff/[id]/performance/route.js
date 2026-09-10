import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

const REPORT_ROLES = ['admin', 'manager'];

// A manager's drill-down into ONE staff member's numbers — sales, orders,
// payment-method mix, invoices they've created, and their recent orders.
export async function GET(request, { params }) {
  const auth = await requireRole(prisma, REPORT_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const staffId = parseInt(rawId, 10);
  if (!Number.isFinite(staffId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const toParam = searchParams.get('to');
  const to = toParam ? new Date(toParam) : new Date();
  const from = searchParams.get('from') ? new Date(searchParams.get('from')) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
  }
  if (toParam) to.setUTCHours(23, 59, 59, 999);

  try {
    const staff = await prisma.adminUser.findFirst({
      where: { id: staffId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 });

    // A staff member's own sales are orders they rang up (staffId) OR were
    // attributed as the serving waiter for (waiterId) — mirrors /api/admin/me/performance.
    const where = {
      paymentStatus: 'paid',
      createdAt: { gte: from, lte: to },
      OR: [{ staffId }, { waiterId: staffId }],
    };

    const [agg, byMethod, recent, invoicesCreated] = await Promise.all([
      prisma.order.aggregate({ where, _sum: { total: true }, _count: { _all: true } }),
      prisma.order.groupBy({ by: ['paymentMethod'], where, _sum: { total: true }, _count: { _all: true } }),
      prisma.order.findMany({
        where, orderBy: { createdAt: 'desc' }, take: 20,
        select: { id: true, reference: true, total: true, orderType: true, tableNumber: true, paymentMethod: true, createdAt: true },
      }),
      prisma.invoice.aggregate({
        where: { createdBy: staffId, createdAt: { gte: from, lte: to }, status: { not: 'void' } },
        _sum: { total: true }, _count: { _all: true },
      }),
    ]);

    const total = Number(agg._sum.total || 0);
    const orders = agg._count._all;

    return NextResponse.json({
      staff: { id: staff.id, name: staff.name || staff.email, role: staff.role, isActive: staff.isActive },
      from, to,
      total,
      orders,
      avgTicket: orders ? total / orders : 0,
      paymentMethodMix: byMethod
        .map((r) => ({ method: r.paymentMethod || 'unspecified', total: Number(r._sum.total || 0), orders: r._count._all }))
        .sort((a, b) => b.total - a.total),
      invoicesCreated: { count: invoicesCreated._count._all, total: Number(invoicesCreated._sum.total || 0) },
      recent: recent.map((o) => ({ ...o, total: o.total.toString() })),
    });
  } catch (err) {
    console.error('GET /api/admin/staff/[id]/performance:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
