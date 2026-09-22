import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { posOrderSchema } from '../../validations/orders.validation.js';
import { priceCart } from '../../lib/orders/cartPricing.js';
import { computeOrderTotals } from '../../lib/orders/orderTotals.js';
import { resolveCollector, resolveSalePayment } from '../../lib/money/cashBook.js';
import { checkTendered, closedSaleFields, createSaleInvoice, resolveInvoiceCustomer, writeClosedSaleEntries, type CloseInput } from '../../lib/orders/closeSale.js';
import { ORDER_INCLUDE, serializeOrder } from '../../lib/orders/orderSerialize.js';
import { getOrderPrefix } from '../../lib/orders/orderCode.js';
import { readJson } from '../../utils/body.js';
import { resolveTable } from '../../lib/orders/tables.js';
import { writeOrderItems, type CartLine } from '../../lib/orders/orderItems.js';
import { stopwatch } from '../../utils/timing.js';

// POST /api/admin/pos/orders — the Register rings up a sale.
//
// Two shapes:
//  • payNow (default) — the classic pay-first sale: priced, closed (receipt #,
//    closedAt) and paid or billed On account in one transaction.
//  • payNow:false — "Pay later" (dine-in): status 'open', unpaid, no receipt #.
//    The kitchen gets the order now; it waits in the Orders page as Unpaid,
//    where a cashier/manager adds items (POST /orders/:id/items) and takes
//    payment (POST /orders/:id/pay).
export async function createPosOrder(req: Request, res: Response) {
  const t = stopwatch('POST /api/admin/pos/orders');
  const auth = await requirePage(prisma, req, 'pos', 'act');
  t.mark('auth');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  try {
    const body = readJson(req);
    const parsed = posOrderSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }

    const {
      items, orderType, tableNumber: tableInput, discountType, discountValue,
      deliveryFee, contactName, contactPhone, address, notes, payNow,
      paymentMethod, accountId, payments, collectedById, amountReceived, invoiceCustomerId, invoiceCustomer, invoiceDueDate,
    } = parsed.data;
    let { waiterId } = parsed.data;

    // A waiter operating the register is always attributed to their own
    // sale — the client is never trusted for this. A cashier/manager ringing
    // up on a waiter's behalf may still pick any waiter from the picker.
    if (auth.session!.role === 'waiter') {
      waiterId = auth.session!.userId;
    } else if (orderType === 'dine_in' && !waiterId) {
      // Every table has a waiter — reports and tips key off it.
      return res.status(400).json({ error: 'Choose the waiter serving this table' });
    }
    const checkWaiter = auth.session!.role !== 'waiter' && !!waiterId;

    // Independent reads, in parallel (each is a DB round trip): the table
    // ("T5" = "Table 5" = "5" once tables are defined), the chosen waiter, the
    // server-side price of every line (item + option + extras — client prices
    // are never trusted) and the order-code prefix for the response.
    const [table, waiter, priced, prefix] = await Promise.all([
      orderType === 'dine_in' ? resolveTable(prisma, tableInput) : null,
      checkWaiter
        ? prisma.adminUser.findFirst({ where: { id: waiterId!, role: 'waiter', isActive: true }, select: { id: true } })
        : null,
      priceCart(prisma, items),
      getOrderPrefix(prisma),
    ]);
    t.mark('lookups');
    let tableNumber: string | null | undefined = tableInput;
    if (table) {
      if (!table.ok) return res.status(400).json({ error: table.error });
      tableNumber = table.value;
    }
    if (checkWaiter && !waiter) return res.status(404).json({ error: 'Waiter not found' });
    if (priced.error) {
      return res.status(400).json({ error: priced.error });
    }
    const pricedItems = priced.lines as unknown as Prisma.InputJsonValue;

    // Discount clamping, delivery-fee rule and rounding live in one shared
    // helper so the manager edit route prices a correction identically.
    const totals = computeOrderTotals({ totalCents: priced.totalCents!, discountType, discountValue, orderType, deliveryFee });
    if (totals.error) return res.status(400).json({ error: totals.error });
    const { subtotal, discount, delivery, total } = totals as { subtotal: number; discount: number; delivery: number; total: number };

    let close: CloseInput | null = null;
    if (payNow) {
      // Which business account(s) the money went into, and who took it (the
      // waiter serving the table by default, else whoever rang it up) — independent, so together.
      const [payment, collector] = await Promise.all([
        resolveSalePayment(prisma, { paymentMethod: paymentMethod!, accountId, payments }, total),
        resolveCollector(prisma, auth.session!, collectedById ?? (orderType === 'dine_in' ? waiterId : null)),
      ]);
      if (!payment.ok) return res.status(400).json({ error: payment.error });
      if (!collector.ok) return res.status(collector.status ?? 400).json({ error: collector.error });
      close = {
        payment: payment.value, collectedById: collector.value,
        amountReceived, invoiceCustomerId, invoiceCustomer, invoiceDueDate,
      };
      const short = checkTendered(close, total);
      if (short) return res.status(400).json({ error: short });
    }

    t.mark('payment');
    const result = await prisma.$transaction(async (tx) => {
      const customer = close ? await resolveInvoiceCustomer(tx, close) : null;
      const closed = close ? await closedSaleFields(tx, close) : null;

      const order = await tx.order.create({
        data: {
          customerId: customer?.id ?? null,
          staffId: auth.session!.userId,
          source: 'pos',
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
          // Pay later: in the kitchen, not yet paid, no receipt number.
          ...(closed ?? { status: 'open', paymentStatus: 'unpaid' }),
        },
      });

      await writeOrderItems(tx, order.id, pricedItems as unknown as CartLine[]);
      if (close && closed) await writeClosedSaleEntries(tx, order.id, close, auth.session!.userId ?? null, closed.closedAt);

      const invoice = customer
        ? await createSaleInvoice(tx, {
            orderId: order.id, customerId: customer.id, items: pricedItems, subtotal, discount, total,
            dueDate: invoiceDueDate, tableNumber: order.tableNumber, orderType: order.orderType, userId: auth.session!.userId,
          })
        : null;
      return { order, invoice };
    });

    t.mark('transaction');
    // The saved sale with everything the receipt prints (cash-book split, pay-to numbers).
    const fresh = await prisma.order.findUnique({ where: { id: result.order.id }, include: ORDER_INCLUDE });
    t.mark('reload');
    t.send(res);
    return res.status(201).json({
      ...serializeOrder(fresh, prefix),
      subtotal,
      invoiceId: result.invoice?.id ?? null,
    });
  } catch (err) {
    const e = err as { httpStatus?: number; message?: string };
    if (e.httpStatus) return res.status(e.httpStatus).json({ error: e.message });
    console.error('POST /api/admin/pos/orders:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
