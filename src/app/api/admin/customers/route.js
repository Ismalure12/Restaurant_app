import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireStaff } from '@/lib/auth';
import { customerSchema } from '@/lib/validations';

// Owed balance = sum(total - amountPaid) across every non-void invoice,
// clamped at 0 — same clamping convention as finance/summary's
// invoiceOutstandingAgg, just scoped per customer instead of platform-wide.
async function owedBalancesFor(customerIds) {
  if (!customerIds.length) return {};
  const rows = await prisma.invoice.groupBy({
    by: ['customerId'],
    where: { customerId: { in: customerIds }, status: { not: 'void' } },
    _sum: { total: true, amountPaid: true },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [
    r.customerId,
    {
      owedBalance: Math.max(0, Number(r._sum.total || 0) - Number(r._sum.amountPaid || 0)),
      invoiceCount: r._count._all,
    },
  ]));
}

export async function GET(request) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const take = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 100);
  const cursorParam = parseInt(searchParams.get('cursor') ?? '', 10);

  const where = q
    ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] }
    : {};

  try {
    const customers = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(Number.isFinite(cursorParam) ? { cursor: { id: cursorParam }, skip: 1 } : {}),
    });

    const hasMore = customers.length > take;
    const page = hasMore ? customers.slice(0, take) : customers;
    const balances = await owedBalancesFor(page.map((c) => c.id));

    const result = {
      customers: page.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        address: c.address,
        createdAt: c.createdAt,
        owedBalance: balances[c.id]?.owedBalance ?? 0,
        invoiceCount: balances[c.id]?.invoiceCount ?? 0,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };

    // Only compute the platform-wide summary on an unfiltered first page —
    // it doesn't change per search term/page and is wasted work otherwise.
    if (!q && !Number.isFinite(cursorParam)) {
      const [totalCustomers, allBalances] = await Promise.all([
        prisma.customer.count(),
        prisma.invoice.groupBy({
          by: ['customerId'],
          where: { status: { not: 'void' } },
          _sum: { total: true, amountPaid: true },
        }),
      ]);
      let customersWithBalance = 0;
      let totalOutstanding = 0;
      for (const r of allBalances) {
        const balance = Math.max(0, Number(r._sum.total || 0) - Number(r._sum.amountPaid || 0));
        if (balance > 0) { customersWithBalance += 1; totalOutstanding += balance; }
      }
      result.summary = { totalCustomers, customersWithBalance, totalOutstanding };
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/admin/customers:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const parsed = customerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }
    const { name, phone, address } = parsed.data;

    const customer = await prisma.customer.create({
      data: { name, phone, address: address || null },
    });

    return NextResponse.json({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      createdAt: customer.createdAt,
      owedBalance: 0,
      invoiceCount: 0,
    }, { status: 201 });
  } catch (err) {
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'A customer with this phone already exists' }, { status: 409 });
    }
    console.error('POST /api/admin/customers:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
