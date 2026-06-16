import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { waafiCommit } from '@/lib/waafi';

export const maxDuration = 60;

export async function POST(request, { params }) {
  const auth = await requireAdmin(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (!Number.isFinite(orderId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: { select: { name: true, phone: true } } },
    });
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.status !== 'pending') {
      return NextResponse.json({ error: `Order is already ${order.status}` }, { status: 409 });
    }
    if (!order.paymentTransactionId) {
      return NextResponse.json({ error: 'Order has no payment transaction to capture' }, { status: 409 });
    }

    const waafi = await waafiCommit({
      transactionId: order.paymentTransactionId,
      description: `Order #${order.id} accepted`,
    });

    if (!waafi.ok) {
      return NextResponse.json(
        { error: waafi.message || 'Waafi capture failed', responseCode: waafi.responseCode },
        { status: 502 },
      );
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      // Capturing the Waafi pre-auth means the money is in — mark it paid so it
      // counts toward finance revenue (method = waafi).
      data: { status: 'confirmed', paymentStatus: 'paid', paymentMethod: 'waafi' },
      include: { customer: { select: { name: true, phone: true } } },
    });

    return NextResponse.json({
      success: true,
      order: {
        id: updated.id,
        reference: updated.reference,
        status: updated.status,
        total: updated.total.toString(),
        address: updated.address,
        orderType: updated.orderType,
        tableNumber: updated.tableNumber,
        items: updated.items,
        createdAt: updated.createdAt,
        customer: updated.customer,
      },
    });
  } catch (err) {
    console.error('POST /api/admin/orders/[id]/accept:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
