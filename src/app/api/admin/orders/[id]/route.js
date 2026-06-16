import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(request, { params }) {
  const auth = await requireAdmin(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { customer: true, staff: { select: { name: true, email: true } }, waiter: { select: { name: true, email: true } } },
    });

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    return NextResponse.json({
      id: order.id,
      reference: order.reference,
      status: order.status,
      total: order.total.toString(),
      address: order.address,
      orderType: order.orderType,
      tableNumber: order.tableNumber,
      source: order.source,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      amountReceived: order.amountReceived?.toString() ?? null,
      discount: order.discount?.toString() ?? '0',
      deliveryFee: order.deliveryFee?.toString() ?? '0',
      contactName: order.contactName,
      contactPhone: order.contactPhone,
      staff: order.staff ? (order.staff.name || order.staff.email) : null,
      waiter: order.waiter ? (order.waiter.name || order.waiter.email) : null,
      items: order.items,
      paymentTransactionId: order.paymentTransactionId,
      createdAt: order.createdAt,
      customer: order.customer,
    });
  } catch (err) {
    console.error('GET /api/admin/orders/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
