import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePos } from '@/lib/auth';
import { posOrderSchema } from '@/lib/validations';

export async function POST(request) {
  const auth = await requirePos(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const parsed = posOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const {
      items, orderType, tableNumber, waiterId, discountType, discountValue,
      deliveryFee, contactName, contactPhone, address, notes,
    } = parsed.data;

    // Everything is recomputed server-side; never trust client totals.
    // unitPrice already includes option + extras.
    const subtotal = items.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

    // Resolve discount from type/value, clamped to [0, subtotal].
    let discount = 0;
    if (discountType && discountValue > 0) {
      discount = discountType === 'percent' ? (subtotal * discountValue) / 100 : discountValue;
    }
    discount = Math.min(Math.max(discount, 0), subtotal);
    discount = Math.round(discount * 100) / 100;

    // Delivery fee only applies to delivery orders.
    const delivery = orderType === 'delivery' ? Math.max(deliveryFee || 0, 0) : 0;

    const total = Math.round((subtotal - discount + delivery) * 100) / 100;
    if (!(total > 0)) return NextResponse.json({ error: 'Order total must be greater than zero' }, { status: 400 });

    const order = await prisma.order.create({
      data: {
        customerId: null,
        staffId: auth.session.userId,
        source: 'pos',
        status: 'confirmed',
        // Paid in person at the counter — no separate payment step or method tracked.
        paymentStatus: 'paid',
        paymentMethod: null,
        orderType,
        tableNumber: orderType === 'dine_in' ? (tableNumber || null) : null,
        waiterId: waiterId ?? null,
        discount,
        deliveryFee: delivery,
        contactName: orderType === 'delivery' ? (contactName || null) : null,
        contactPhone: orderType === 'delivery' ? (contactPhone || null) : null,
        address: orderType === 'delivery' ? (address || null) : (notes || null),
        items,
        total,
        reference: 'pos-' + crypto.randomUUID(),
      },
    });

    return NextResponse.json({
      id: order.id,
      reference: order.reference,
      subtotal,
      discount,
      deliveryFee: delivery,
      total: order.total.toString(),
      orderType: order.orderType,
      tableNumber: order.tableNumber,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
    }, { status: 201 });
  } catch (err) {
    console.error('POST /api/admin/pos/orders:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
