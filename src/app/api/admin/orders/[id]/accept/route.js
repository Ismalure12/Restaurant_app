import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireStaff } from '@/lib/auth';
import { waafiCommit } from '@/lib/waafi';
import { ORDER_INCLUDE, serializeOrder } from '@/lib/orderSerialize';

export const maxDuration = 60;

// Accepting a pending online order is counter work — any back-office staff
// member (admin/manager/cashier) may capture the Waafi pre-authorization.
export async function POST(request, { params }) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (!Number.isFinite(orderId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
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

    // Guarded on status so a concurrent decline can't be silently overwritten.
    // Capturing the pre-auth means the money is in — mark it paid so it counts
    // toward revenue (method = waafi).
    const written = await prisma.order.updateMany({
      where: { id: order.id, status: 'pending' },
      data: { status: 'confirmed', paymentStatus: 'paid', paymentMethod: 'waafi' },
    });
    if (written.count === 0) {
      console.error(`POST /api/admin/orders/[id]/accept: Waafi captured but order ${order.reference} was no longer pending`);
      return NextResponse.json({ error: 'Payment was captured but the order changed at the same time — check this order before acting again' }, { status: 409 });
    }

    const updated = await prisma.order.findUnique({ where: { id: order.id }, include: ORDER_INCLUDE });
    return NextResponse.json({ success: true, order: serializeOrder(updated) });
  } catch (err) {
    console.error(`POST /api/admin/orders/[id]/accept (order ${orderId}):`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
