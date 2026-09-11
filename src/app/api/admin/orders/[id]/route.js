import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireStaff } from '@/lib/auth';
import { updateOrderSchema } from '@/lib/validations';
import { priceCart } from '@/lib/cartPricing';
import { computeOrderTotals } from '@/lib/orderTotals';
import { ORDER_INCLUDE, serializeOrder } from '@/lib/orderSerialize';

// Editing a completed sale rewrites money already counted in the day's
// revenue — a manager-tier call. Checked inline after requireStaff, mirroring
// VOID_ROLES in /api/admin/invoices/[id].
const EDIT_ROLES = ['admin', 'manager'];

const round2 = (n) => Math.round(n * 100) / 100;
const httpError = (message, httpStatus) => Object.assign(new Error(message), { httpStatus });

function parseId(raw) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : null;
}

export async function GET(request, { params }) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    return NextResponse.json(serializeOrder(order));
  } catch (err) {
    console.error(`GET /api/admin/orders/[id] (order ${id}):`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Manager correction of an existing sale — this lets an admin/manager replace
 * the items, discount, delivery fee, table and contact on a confirmed order,
 * and rejects any edit that would move the total away from money already
 * collected through a channel that cannot give it back.
 *
 * Invariants (the schema can't express them):
 *  - Every price is recomputed from the database; client totals are ignored.
 *  - pending orders (Waafi pre-auth held for the old amount) and captured
 *    Waafi orders (no refund/adjust API exists) are not editable — void them.
 *  - A linked invoice's items/subtotal/discount/total are rewritten in the SAME
 *    transaction; its status is re-derived from amountPaid, never set directly,
 *    and a total below amountPaid is refused (the schema can't hold a credit).
 */
export async function PATCH(request, { params }) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!EDIT_ROLES.includes(auth.session.role)) {
    return NextResponse.json({ error: 'Only a manager can edit an order' }, { status: 403 });
  }

  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    const parsed = updateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }
    const {
      items, orderType, tableNumber, discountType, discountValue,
      deliveryFee, contactName, contactPhone, address, notes, editReason,
    } = parsed.data;

    const order = await prisma.order.findUnique({
      where: { id },
      include: { invoice: { select: { id: true, status: true } } },
    });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    // ── Which orders may be edited at all ────────────────────────────────
    if (order.status === 'pending') {
      return NextResponse.json({ error: 'Accept or decline this order first — the pre-authorized payment amount cannot be changed' }, { status: 409 });
    }
    if (order.status !== 'confirmed') {
      return NextResponse.json({ error: `A ${order.status} order cannot be edited` }, { status: 409 });
    }
    if (order.paymentStatus === 'refunded') {
      return NextResponse.json({ error: 'A refunded order cannot be edited' }, { status: 409 });
    }
    if (order.paymentMethod === 'waafi' && order.paymentStatus === 'paid') {
      return NextResponse.json({ error: 'This sale was captured through Waafi, which has no refund or adjustment service — void the order instead of editing it' }, { status: 409 });
    }
    if (order.invoice && order.invoice.status === 'void') {
      return NextResponse.json({ error: "This order's invoice has been voided — the sale is closed" }, { status: 409 });
    }

    // ── Reprice + recompute server-side, before opening the transaction ──
    const priced = await priceCart(prisma, items);
    if (priced.error) {
      // 409, not the create route's 400: the rejected line may be a historical
      // line the manager never touched whose menu item has since been removed.
      return NextResponse.json({ error: `${priced.error}. Remove that line, or void the order instead.` }, { status: 409 });
    }
    const totals = computeOrderTotals({ totalCents: priced.totalCents, discountType, discountValue, orderType, deliveryFee });
    if (totals.error) return NextResponse.json({ error: totals.error }, { status: 400 });
    const { subtotal, discount, delivery, total } = totals;
    const previousTotal = Number(order.total);

    // ── One transaction: order + invoice, all or nothing ────────────────
    await prisma.$transaction(async (tx) => {
      // Optimistic concurrency (no row locks without raw SQL): the row must
      // still look exactly as it did when we priced it.
      const written = await tx.order.updateMany({
        where: { id: order.id, status: order.status, paymentStatus: order.paymentStatus, updatedAt: order.updatedAt },
        data: {
          items: priced.lines,
          total,
          discount,
          deliveryFee: delivery,
          orderType,
          // Same field mapping as the create route: non-delivery notes live in `address`.
          tableNumber: orderType === 'dine_in' ? (tableNumber || null) : null,
          contactName: orderType === 'delivery' ? (contactName || null) : null,
          contactPhone: orderType === 'delivery' ? (contactPhone || null) : null,
          address: orderType === 'delivery' ? (address || null) : (notes || null),
          editedById: auth.session.userId,
          editedAt: new Date(),
          editReason,
        },
      });
      if (written.count === 0) throw httpError('This order changed while you were editing it — reload and try again', 409);

      if (!order.invoice) return;

      // amountPaid is maintained solely by the invoice payments route; re-read
      // it inside the transaction and treat it as the authority.
      const current = await tx.invoice.findFirst({ where: { id: order.invoice.id } });
      if (!current) throw httpError('Invoice not found', 404);
      if (current.status === 'void') throw httpError("This order's invoice has been voided — the sale is closed", 409);

      const amountPaid = Number(current.amountPaid);
      if (round2(total) < round2(amountPaid)) {
        throw httpError(
          `New total $${total.toFixed(2)} is below the $${amountPaid.toFixed(2)} already paid on invoice #${current.id}. ` +
          'A customer credit can’t be recorded — keep the total at or above the amount paid, or void the order.',
          409,
        );
      }
      // Identical derivation to invoices/[id]/payments/route.js.
      const status = amountPaid >= total ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';

      const invWritten = await tx.invoice.updateMany({
        // Guarded: a payment could commit between the read above and this write.
        where: { id: current.id, amountPaid: current.amountPaid, status: current.status },
        data: {
          items: priced.lines,
          subtotal,
          discount,
          // Includes the delivery fee, exactly as pos/orders/route.js creates it.
          total,
          status,
          tableNumber: orderType === 'dine_in' ? (tableNumber || null) : null,
          orderType,
        },
      });
      if (invWritten.count === 0) throw httpError('A payment was recorded on this invoice while you were editing — reload and try again', 409);
    });

    const fresh = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    return NextResponse.json({
      order: serializeOrder(fresh),
      subtotal: subtotal.toFixed(2),
      previousTotal: previousTotal.toFixed(2),
      // What the drawer owes back (negative) or is owed (positive) after the edit.
      totalDelta: round2(total - previousTotal).toFixed(2),
    });
  } catch (err) {
    if (err.httpStatus) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    console.error(`PATCH /api/admin/orders/[id] (order ${id}):`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
