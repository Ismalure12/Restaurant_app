import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireStaff } from '@/lib/auth';
import { updateInvoiceSchema } from '@/lib/validations';

// Voiding a debt is a manager-tier call, not a cashier one.
const VOID_ROLES = ['admin', 'manager'];

function serializeDetail(inv) {
  const total = Number(inv.total);
  const amountPaid = Number(inv.amountPaid);
  return {
    id: inv.id,
    customer: inv.customer,
    orderId: inv.orderId,
    order: inv.order ? { id: inv.order.id, reference: inv.order.reference } : null,
    items: inv.items,
    subtotal: Number(inv.subtotal).toFixed(2),
    discount: Number(inv.discount).toFixed(2),
    total: total.toFixed(2),
    amountPaid: amountPaid.toFixed(2),
    balance: Math.max(0, total - amountPaid).toFixed(2),
    status: inv.status,
    dueDate: inv.dueDate,
    tableNumber: inv.tableNumber,
    orderType: inv.orderType,
    note: inv.note,
    creator: inv.creator ? (inv.creator.name || inv.creator.email) : null,
    payments: inv.payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount).toFixed(2),
      method: p.method,
      note: p.note,
      recordedBy: p.recorder ? (p.recorder.name || p.recorder.email) : null,
      paidAt: p.paidAt,
    })),
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
  };
}

async function loadInvoice(id) {
  return prisma.invoice.findFirst({
    where: { id },
    include: {
      customer: true,
      order: { select: { id: true, reference: true } },
      creator: { select: { name: true, email: true } },
      payments: { orderBy: { paidAt: 'desc' }, include: { recorder: { select: { name: true, email: true } } } },
    },
  });
}

export async function GET(request, { params }) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const invoice = await loadInvoice(id);
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    return NextResponse.json(serializeDetail(invoice));
  } catch (err) {
    console.error('GET /api/admin/invoices/[id]:', err);
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
    const body = await request.json();
    const parsed = updateInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }
    const { status, ...rest } = parsed.data;

    if (status === 'void' && !VOID_ROLES.includes(auth.session.role)) {
      return NextResponse.json({ error: 'Only a manager can void an invoice' }, { status: 403 });
    }

    const data = { ...rest };
    if (status) data.status = status;
    if (data.dueDate !== undefined) data.dueDate = data.dueDate ? new Date(data.dueDate) : null;

    const updated = await prisma.invoice.updateMany({
      where: { id },
      data,
    });
    if (updated.count === 0) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const invoice = await loadInvoice(id);
    return NextResponse.json(serializeDetail(invoice));
  } catch (err) {
    console.error('PATCH /api/admin/invoices/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
