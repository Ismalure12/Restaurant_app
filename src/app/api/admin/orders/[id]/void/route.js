import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireStaff } from '@/lib/auth';
import { voidOrderSchema } from '@/lib/validations';
import { ORDER_INCLUDE, serializeOrder } from '@/lib/orderSerialize';

// Cancelling a recorded sale is a manager-tier call — checked inline after
// requireStaff, mirroring /api/admin/invoices/[id].
const VOID_ROLES = ['admin', 'manager'];
const httpError = (message, httpStatus) => Object.assign(new Error(message), { httpStatus });

/**
 * Void / refund a whole order — lets an admin/manager cancel a confirmed sale
 * so it leaves every revenue report, and rejects pending, declined or
 * already-voided orders.
 *
 * Void vs refund is DERIVED from paymentStatus. Every revenue aggregate in
 * the app filters on paymentStatus (never status), so a paid order must move
 * to 'refunded' to actually drop out of revenue.
 *
 * Deliberately never calls priceCart, so an order whose menu items were since
 * deleted is still voidable. Records a refund obligation; never executes one —
 * no refund API exists (waafi.js is preauthorize/commit/cancel only).
 */
export async function POST(request, { params }) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!VOID_ROLES.includes(auth.session.role)) {
    return NextResponse.json({ error: 'Only a manager can void an order' }, { status: 403 });
  }

  const id = parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const body = await request.json().catch(() => null);
    const parsed = voidOrderSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }
    const { reason } = parsed.data;

    const order = await prisma.order.findUnique({
      where: { id },
      include: { invoice: { select: { id: true, status: true } } },
    });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    if (order.status === 'pending') {
      return NextResponse.json({ error: 'This order still holds a Waafi pre-authorization — decline it instead, which releases the funds' }, { status: 409 });
    }
    if (order.status === 'voided') return NextResponse.json({ error: 'Order is already voided' }, { status: 409 });
    if (order.status === 'declined') return NextResponse.json({ error: 'A declined order has nothing to void' }, { status: 409 });

    const wasPaid = order.paymentStatus === 'paid';
    const nextPaymentStatus = wasPaid ? 'refunded' : order.paymentStatus;

    const invoiceCollected = await prisma.$transaction(async (tx) => {
      const written = await tx.order.updateMany({
        where: { id: order.id, status: order.status, paymentStatus: order.paymentStatus, updatedAt: order.updatedAt },
        data: {
          status: 'voided',
          // 'unpaid' stays 'unpaid': nothing was collected, so 'refunded' would be a lie.
          paymentStatus: nextPaymentStatus,
          voidedById: auth.session.userId,
          voidedAt: new Date(),
          voidReason: reason,
        },
      });
      if (written.count === 0) throw httpError('This order changed while you were voiding it — reload and try again', 409);

      if (!order.invoice || order.invoice.status === 'void') return 0;
      const inv = await tx.invoice.findFirst({ where: { id: order.invoice.id }, select: { id: true, amountPaid: true } });
      if (!inv) return 0;
      // InvoicePayment rows are kept on purpose: that cash really entered the
      // drawer, and the daily collections report is keyed on paidAt.
      await tx.invoice.updateMany({ where: { id: inv.id }, data: { status: 'void' } });
      return Number(inv.amountPaid);
    });

    const fresh = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    return NextResponse.json({
      order: serializeOrder(fresh),
      refund: {
        orderAmount: (wasPaid ? Number(order.total) : 0).toFixed(2),
        invoiceCollected: invoiceCollected.toFixed(2),
        executed: false,
      },
    });
  } catch (err) {
    if (err.httpStatus) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    console.error(`POST /api/admin/orders/[id]/void (order ${id}):`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
