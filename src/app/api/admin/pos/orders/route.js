import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePos } from '@/lib/auth';
import { posOrderSchema } from '@/lib/validations';
import { priceCart } from '@/lib/cartPricing';
import { computeOrderTotals } from '@/lib/orderTotals';

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
      items, orderType, tableNumber, discountType, discountValue,
      deliveryFee, contactName, contactPhone, address, notes,
      paymentMethod, amountReceived, invoiceCustomerId, invoiceCustomer, invoiceDueDate,
    } = parsed.data;
    let { waiterId } = parsed.data;

    // A waiter operating the register is always attributed to their own
    // sale — the client is never trusted for this. A cashier/manager ringing
    // up on a waiter's behalf may still pick any waiter from the picker.
    if (auth.session.role === 'waiter') {
      waiterId = auth.session.userId;
    } else if (waiterId) {
      const waiter = await prisma.adminUser.findFirst({
        where: { id: waiterId, role: 'waiter', isActive: true },
        select: { id: true },
      });
      if (!waiter) return NextResponse.json({ error: 'Waiter not found' }, { status: 404 });
    }

    // Everything is recomputed server-side; never trust client totals.
    // Each line's unitPrice is repriced from the database (item + option + extras).
    const priced = await priceCart(prisma, items);
    if (priced.error) {
      return NextResponse.json({ error: priced.error }, { status: 400 });
    }
    const pricedItems = priced.lines;

    // Discount clamping, delivery-fee rule and rounding live in one shared
    // helper so the manager edit route prices a correction identically.
    const totals = computeOrderTotals({ totalCents: priced.totalCents, discountType, discountValue, orderType, deliveryFee });
    if (totals.error) return NextResponse.json({ error: totals.error }, { status: 400 });
    const { subtotal, discount, delivery, total } = totals;

    const isInvoice = paymentMethod === 'invoice';

    const result = await prisma.$transaction(async (tx) => {
      // Invoice sales bill a customer instead of collecting payment now —
      // resolve/create that customer before the order so we can link it.
      let invoiceCustomerRow = null;
      if (isInvoice) {
        if (invoiceCustomerId) {
          invoiceCustomerRow = await tx.customer.findFirst({ where: { id: invoiceCustomerId } });
          if (!invoiceCustomerRow) throw Object.assign(new Error('Customer not found'), { httpStatus: 404 });
        } else {
          const existing = await tx.customer.findUnique({ where: { phone: invoiceCustomer.phone } });
          invoiceCustomerRow = await tx.customer.upsert({
            where: { phone: invoiceCustomer.phone },
            update: { name: invoiceCustomer.name, address: invoiceCustomer.address ?? existing?.address ?? '' },
            create: {
              phone: invoiceCustomer.phone,
              name: invoiceCustomer.name,
              address: invoiceCustomer.address ?? '',
            },
          });
        }
      }

      const order = await tx.order.create({
        data: {
          customerId: isInvoice ? invoiceCustomerRow.id : null,
          staffId: auth.session.userId,
          source: 'pos',
          status: 'confirmed',
          // Cash/card/evc are collected at the counter and paid immediately;
          // an invoice bills the customer instead — no money changes hands now.
          paymentStatus: isInvoice ? 'unpaid' : 'paid',
          paymentMethod,
          amountReceived: !isInvoice && amountReceived != null ? amountReceived : null,
          orderType,
          tableNumber: orderType === 'dine_in' ? (tableNumber || null) : null,
          waiterId: waiterId ?? null,
          discount,
          deliveryFee: delivery,
          contactName: orderType === 'delivery' ? (contactName || null) : null,
          contactPhone: orderType === 'delivery' ? (contactPhone || null) : null,
          address: orderType === 'delivery' ? (address || null) : (notes || null),
          items: pricedItems,
          total,
          reference: 'pos-' + crypto.randomUUID(),
        },
      });

      let invoice = null;
      if (isInvoice) {
        invoice = await tx.invoice.create({
          data: {
            customerId: invoiceCustomerRow.id,
            orderId: order.id,
            items: pricedItems,
            subtotal,
            discount,
            total,
            dueDate: invoiceDueDate ? new Date(invoiceDueDate) : null,
            tableNumber: order.tableNumber,
            orderType: order.orderType,
            createdBy: auth.session.userId,
          },
        });
      }

      return { order, invoice };
    });

    const { order, invoice } = result;

    return NextResponse.json({
      id: order.id,
      reference: order.reference,
      subtotal,
      discount,
      deliveryFee: delivery,
      total: order.total.toString(),
      orderType: order.orderType,
      tableNumber: order.tableNumber,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      amountReceived: order.amountReceived?.toString() ?? null,
      invoiceId: invoice?.id ?? null,
      createdAt: order.createdAt,
    }, { status: 201 });
  } catch (err) {
    if (err.httpStatus === 404) return NextResponse.json({ error: err.message }, { status: 404 });
    console.error('POST /api/admin/pos/orders:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
