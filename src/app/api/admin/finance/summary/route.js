import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

const FINANCE_ROLES = ['admin', 'manager'];

export async function GET(request) {
  const auth = await requireRole(prisma, FINANCE_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  // Default window: last 30 days.
  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
  }
  // A date-only `to` (YYYY-MM-DD) parses as UTC midnight; extend to end-of-day so
  // `lte: to` includes the whole final day instead of dropping it.
  if (toParam) to.setUTCHours(23, 59, 59, 999);

  try {
    const paidWhere = { paymentStatus: 'paid', createdAt: { gte: from, lte: to } };
    const invoiceWhere = { createdAt: { gte: from, lte: to }, status: { not: 'void' } };

    const [revenueAgg, byMethod, byStaff, expenseByCat, orderCount, invoiceAgg, invoiceOutstandingAgg] = await Promise.all([
      prisma.order.aggregate({ where: paidWhere, _sum: { total: true } }),
      prisma.order.groupBy({ by: ['paymentMethod'], where: paidWhere, _sum: { total: true } }),
      prisma.order.groupBy({ by: ['staffId'], where: paidWhere, _sum: { total: true }, _count: { _all: true } }),
      prisma.expense.groupBy({ by: ['category'], where: { incurredAt: { gte: from, lte: to } }, _sum: { amount: true } }),
      prisma.order.count({ where: paidWhere }),
      // Invoicing is billed revenue, tracked separately from collected cash/card/evc.
      prisma.invoice.aggregate({ where: invoiceWhere, _sum: { total: true, amountPaid: true } }),
      prisma.invoice.aggregate({ where: { status: { in: ['unpaid', 'partial'] } }, _sum: { total: true, amountPaid: true } }),
    ]);

    const revenueTotal = Number(revenueAgg._sum.total || 0);
    const revenueByMethod = byMethod
      .map((r) => ({ method: r.paymentMethod || 'unspecified', total: Number(r._sum.total || 0) }))
      .sort((a, b) => b.total - a.total);
    const invoicedTotal = Number(invoiceAgg._sum.total || 0);
    // Outstanding balance across ALL open invoices (not just this window) —
    // what customers currently owe, as of now.
    const invoiceOutstanding = Math.max(0, Number(invoiceOutstandingAgg._sum.total || 0) - Number(invoiceOutstandingAgg._sum.amountPaid || 0));

    const expensesByCategory = expenseByCat.map((r) => ({
      category: r.category,
      total: Number(r._sum.amount || 0),
    }));
    const expensesTotal = expensesByCategory.reduce((s, r) => s + r.total, 0);

    // Resolve staff names for sales-by-staff.
    const staffIds = byStaff.map((r) => r.staffId).filter((x) => x != null);
    const staffRows = staffIds.length
      ? await prisma.adminUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true, email: true } })
      : [];
    const staffName = Object.fromEntries(staffRows.map((s) => [s.id, s.name || s.email]));
    const salesByStaff = byStaff.map((r) => ({
      staffId: r.staffId,
      name: r.staffId == null ? 'Online / unattributed' : (staffName[r.staffId] || `Staff #${r.staffId}`),
      total: Number(r._sum.total || 0),
      count: r._count._all,
    })).sort((a, b) => b.total - a.total);

    return NextResponse.json({
      from,
      to,
      revenueTotal,
      revenueByMethod,
      invoicedTotal,
      invoiceOutstanding,
      expensesTotal,
      expensesByCategory,
      net: revenueTotal - expensesTotal,
      orderCount,
      salesByStaff,
    });
  } catch (err) {
    console.error('GET /api/admin/finance/summary:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
