import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireStaff } from '@/lib/auth';
import { updateCustomerSchema } from '@/lib/validations';

export async function GET(request, { params }) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const customer = await prisma.customer.findFirst({ where: { id } });
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    const [balanceAgg, invoices] = await Promise.all([
      prisma.invoice.aggregate({
        where: { customerId: id, status: { not: 'void' } },
        _sum: { total: true, amountPaid: true },
      }),
      prisma.invoice.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, total: true, amountPaid: true, status: true, dueDate: true, tableNumber: true, createdAt: true },
      }),
    ]);
    const owedBalance = Math.max(0, Number(balanceAgg._sum.total || 0) - Number(balanceAgg._sum.amountPaid || 0));

    return NextResponse.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        createdAt: customer.createdAt,
      },
      owedBalance,
      invoices: invoices.map((inv) => {
        const total = Number(inv.total);
        const amountPaid = Number(inv.amountPaid);
        return {
          id: inv.id,
          total: total.toFixed(2),
          amountPaid: amountPaid.toFixed(2),
          balance: Math.max(0, total - amountPaid).toFixed(2),
          status: inv.status,
          dueDate: inv.dueDate,
          tableNumber: inv.tableNumber,
          createdAt: inv.createdAt,
        };
      }),
    });
  } catch (err) {
    console.error('GET /api/admin/customers/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const existing = await prisma.customer.findFirst({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    const body = await request.json();
    const parsed = updateCustomerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const data = { ...parsed.data };
    if (data.address !== undefined) data.address = data.address || null;

    const customer = await prisma.customer.update({ where: { id }, data });
    return NextResponse.json({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      createdAt: customer.createdAt,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'A customer with this phone already exists' }, { status: 409 });
    }
    console.error('PATCH /api/admin/customers/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
