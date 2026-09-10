import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireStaff } from '@/lib/auth';
import { createInvoiceSchema } from '@/lib/validations';

function serialize(inv) {
  const total = Number(inv.total);
  const amountPaid = Number(inv.amountPaid);
  return {
    id: inv.id,
    customerId: inv.customerId,
    customerName: inv.customer?.name ?? null,
    customerPhone: inv.customer?.phone ?? null,
    orderId: inv.orderId,
    total: total.toFixed(2),
    amountPaid: amountPaid.toFixed(2),
    balance: Math.max(0, total - amountPaid).toFixed(2),
    status: inv.status,
    dueDate: inv.dueDate,
    tableNumber: inv.tableNumber,
    orderType: inv.orderType,
    note: inv.note,
    creator: inv.creator ? (inv.creator.name || inv.creator.email) : null,
    createdAt: inv.createdAt,
  };
}

export async function GET(request) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status'); // unpaid | partial | paid | void
  const customerId = parseInt(searchParams.get('customerId') ?? '', 10);
  const q = (searchParams.get('q') || '').trim();
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const take = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 100);
  const cursorParam = parseInt(searchParams.get('cursor') ?? '', 10);

  const where = {};
  if (['unpaid', 'partial', 'paid', 'void'].includes(status)) where.status = status;
  if (Number.isFinite(customerId)) where.customerId = customerId;
  if (fromParam || toParam) {
    where.createdAt = {};
    if (fromParam) where.createdAt.gte = new Date(fromParam);
    if (toParam) { const to = new Date(toParam); to.setUTCHours(23, 59, 59, 999); where.createdAt.lte = to; }
  }
  if (q) {
    where.customer = { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] };
  }

  try {
    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(Number.isFinite(cursorParam) ? { cursor: { id: cursorParam }, skip: 1 } : {}),
      include: {
        customer: { select: { name: true, phone: true } },
        creator: { select: { name: true, email: true } },
      },
    });

    const hasMore = invoices.length > take;
    const page = hasMore ? invoices.slice(0, take) : invoices;

    return NextResponse.json({
      invoices: page.map(serialize),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (err) {
    console.error('GET /api/admin/invoices:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const parsed = createInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }
    const { customerId, customer, items, discount, dueDate, tableNumber, note } = parsed.data;

    const subtotal = Math.round(items.reduce((s, l) => s + l.quantity * l.unitPrice, 0) * 100) / 100;
    const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
    if (!(total > 0)) return NextResponse.json({ error: 'Invoice total must be greater than zero' }, { status: 400 });

    const invoice = await prisma.$transaction(async (tx) => {
      let customerRow;
      if (customerId) {
        customerRow = await tx.customer.findFirst({ where: { id: customerId } });
        if (!customerRow) throw Object.assign(new Error('Customer not found'), { httpStatus: 404 });
      } else {
        const existing = await tx.customer.findUnique({ where: { phone: customer.phone } });
        customerRow = await tx.customer.upsert({
          where: { phone: customer.phone },
          update: { name: customer.name, address: customer.address ?? existing?.address ?? '' },
          create: { phone: customer.phone, name: customer.name, address: customer.address ?? '' },
        });
      }

      return tx.invoice.create({
        data: {
          customerId: customerRow.id,
          items,
          subtotal,
          discount,
          total,
          dueDate: dueDate ? new Date(dueDate) : null,
          tableNumber: tableNumber || null,
          note: note || null,
          createdBy: auth.session.userId,
        },
        include: { customer: { select: { name: true, phone: true } }, creator: { select: { name: true, email: true } } },
      });
    });

    return NextResponse.json(serialize(invoice), { status: 201 });
  } catch (err) {
    if (err.httpStatus === 404) return NextResponse.json({ error: err.message }, { status: 404 });
    console.error('POST /api/admin/invoices:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
