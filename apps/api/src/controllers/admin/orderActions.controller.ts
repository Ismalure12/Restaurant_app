import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { ORDER_INCLUDE, serializeOrder } from '../../lib/orders/orderSerialize.js';
import { getOrderPrefix } from '../../lib/orders/orderCode.js';
import { chargedAmount, refund } from '../../lib/payments/sifalo.js';
import { writeRefundEntries, resolveCollector, resolveSalePayment } from '../../lib/money/cashBook.js';
import { voidOrderSchema, addTabItemsSchema, payTabSchema } from '../../validations/orders.validation.js';
import { audit } from '../../lib/db/audit.js';
import { readJson } from '../../utils/body.js';
import { priceCart } from '../../lib/orders/cartPricing.js';
import { linesTotalCents, type StoredLine } from '../../lib/orders/tabLines.js';
import { writeOrderItems, type CartLine } from '../../lib/orders/orderItems.js';
import { computeOrderTotals } from '../../lib/orders/orderTotals.js';
import { checkTendered, closedSaleFields, createSaleInvoice, httpError, resolveInvoiceCustomer, writeClosedSaleEntries, type CloseInput } from '../../lib/orders/closeSale.js';

// POST /api/admin/orders/:id/accept
// Accepting a pending online order is counter work — any back-office staff
// member (admin/manager/cashier). Sifalo captures the money at checkout, so
// accepting is purely a kitchen decision: no gateway call, status only.
export async function acceptOrder(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'orders', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { id } = req.params;
  const orderId = parseInt(id, 10);
  if (!Number.isFinite(orderId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.status !== 'pending') {
      return res.status(409).json({ error: `Order is already ${order.status}` });
    }

    // Guarded on status so a concurrent decline can't be silently overwritten.
    const written = await prisma.order.updateMany({
      where: { id: order.id, status: 'pending' },
      data: { status: 'confirmed' },
    });
    if (written.count === 0) {
      return res.status(409).json({ error: 'The order changed at the same time — refresh and check it before acting again' });
    }

    const updated = await prisma.order.findUnique({ where: { id: order.id }, include: ORDER_INCLUDE });
    return res.json({ success: true, order: serializeOrder(updated, await getOrderPrefix(prisma)) });
  } catch (err) {
    console.error(`POST /api/admin/orders/[id]/accept (order ${orderId}):`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/admin/orders/:id/decline
// Declining a pending online order gives the customer their money back — any
// back-office staff member. A paid Sifalo order is refunded through Sifalo
// FIRST; the order only moves to declined/refunded once the refund succeeded,
// so a failed refund leaves it pending and the decline can simply be retried.
export async function declineOrder(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'orders', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { id } = req.params;
  const orderId = parseInt(id, 10);
  if (!Number.isFinite(orderId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.status !== 'pending') {
      return res.status(409).json({ error: `Order is already ${order.status}` });
    }

    const wasPaid = order.paymentStatus === 'paid';
    if (wasPaid) {
      if (!order.paymentTransactionId || !order.paymentMethod) {
        return res.status(409).json({ error: 'This order has no Sifalo payment to refund — refund it in the Sifalo portal' });
      }
      const refunded = await refund({
        sid: order.paymentTransactionId,
        gateway: order.paymentMethod,
        amount: chargedAmount(order.total),
        orderId: `${order.reference}-R`,
      });
      if (!refunded.ok) {
        console.error(`POST /api/admin/orders/[id]/decline: refund failed for ${order.reference}: ${refunded.error} (code ${refunded.code ?? '-'})`);
        const hint = order.paymentMethod === 'card' ? ' Card payments may need to be refunded in the Sifalo portal.' : '';
        return res.status(502).json({ error: `Refund failed: ${refunded.error}.${hint}`, responseCode: refunded.code ?? null });
      }
    }

    // Status + the money going back out of the Sifalo account, all or nothing.
    const written = await prisma.$transaction(async (tx) => {
      const w = await tx.order.updateMany({
        where: { id: order.id, status: 'pending' },
        data: { status: 'declined', ...(wasPaid ? { paymentStatus: 'refunded' } : {}) },
      });
      if (w.count && wasPaid) await writeRefundEntries(tx, order, { createdById: auth.session!.userId ?? null, note: 'Online order declined — refunded by Sifalo' });
      return w;
    });
    if (written.count === 0) {
      console.error(`POST /api/admin/orders/[id]/decline: refunded but order ${order.reference} was no longer pending`);
      return res.status(409).json({ error: 'The refund went through but the order changed at the same time — check this order before acting again' });
    }

    const updated = await prisma.order.findUnique({ where: { id: order.id }, include: ORDER_INCLUDE });
    return res.json({ success: true, order: serializeOrder(updated, await getOrderPrefix(prisma)) });
  } catch (err) {
    console.error(`POST /api/admin/orders/[id]/decline (order ${orderId}):`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Cancelling a recorded sale is a manager-tier call whatever the Orders
// permission says — checked inline after requirePage('orders','act').
const VOID_ROLES = ['admin', 'manager'];

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
 * deleted is still voidable. A paid sale's money is written back out of the
 * accounts it came into (cash-book `refund` rows, dated today). The refund
 * itself is handed over in person — money for an online (Sifalo) sale is
 * returned from the Sifalo portal. Only declining a pending online order
 * refunds automatically (decline route).
 */
export async function voidOrder(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'orders', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!VOID_ROLES.includes(auth.session!.role as string)) {
    return res.status(403).json({ error: 'Only a manager can void an order' });
  }

  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    // Mirrors `await request.json().catch(() => null)`.
    let body;
    try { body = readJson(req); } catch { body = null; }
    const parsed = voidOrderSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }
    const { reason } = parsed.data;

    const order = await prisma.order.findUnique({
      where: { id },
      include: { invoice: { select: { id: true, status: true } } },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status === 'pending') {
      return res.status(409).json({ error: 'This order still holds a Waafi pre-authorization — decline it instead, which releases the funds' });
    }
    if (order.status === 'voided') return res.status(409).json({ error: 'Order is already voided' });
    if (order.status === 'declined') return res.status(409).json({ error: 'A declined order has nothing to void' });

    const wasPaid = order.paymentStatus === 'paid';
    const nextPaymentStatus = wasPaid ? 'refunded' : order.paymentStatus;

    const invoiceCollected = await prisma.$transaction(async (tx) => {
      const written = await tx.order.updateMany({
        where: { id: order.id, status: order.status, paymentStatus: order.paymentStatus, updatedAt: order.updatedAt },
        data: {
          status: 'voided',
          // 'unpaid' stays 'unpaid': nothing was collected, so 'refunded' would be a lie.
          paymentStatus: nextPaymentStatus,
          voidedById: auth.session!.userId,
          voidedAt: new Date(),
          voidReason: reason,
        },
      });
      if (written.count === 0) throw httpError('This order changed while you were voiding it — reload and try again', 409);
      // The money goes back out of the accounts it came into, dated today.
      if (wasPaid) await writeRefundEntries(tx, order, { createdById: auth.session!.userId ?? null, note: `Void: ${reason}` });
      await audit(tx, auth.session!.userId, 'order.void', 'Order', order.id, { reason, total: Number(order.total), wasPaid });

      if (!order.invoice || order.invoice.status === 'void') return 0;
      const inv = await tx.invoice.findFirst({ where: { id: order.invoice.id }, select: { id: true, amountPaid: true } });
      if (!inv) return 0;
      // InvoicePayment rows are kept on purpose: that cash really entered the
      // drawer, and the daily collections report is keyed on paidAt.
      await tx.invoice.updateMany({ where: { id: inv.id }, data: { status: 'void' } });
      return Number(inv.amountPaid);
    });

    const fresh = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    return res.json({
      order: serializeOrder(fresh, await getOrderPrefix(prisma)),
      refund: {
        orderAmount: (wasPaid ? Number(order.total) : 0).toFixed(2),
        invoiceCollected: invoiceCollected.toFixed(2),
        executed: false,
      },
    });
  } catch (err) {
    const e = err as { httpStatus?: number; message?: string };
    if (e.httpStatus) return res.status(e.httpStatus).json({ error: e.message });
    console.error(`POST /api/admin/orders/[id]/void (order ${id}):`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/admin/orders/:id/items — add more items (drinks, dessert…) to an
// UNPAID pay-later order ('open' status internally). Cashier/manager, from the
// Orders page; waiters hand the request to the counter. New lines are priced from
// the database and APPENDED — lines already sent to the kitchen never change
// here (a manager removes one through the edit route, with a reason).
export async function addOrderItems(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'orders', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    let body;
    try { body = readJson(req); } catch { body = null; }
    const parsed = addTabItemsSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'open') return res.status(409).json({ error: 'This order is already paid or closed — start a new order' });

    const priced = await priceCart(prisma, parsed.data.items);
    if (priced.error) return res.status(400).json({ error: priced.error });

    const addedAt = new Date().toISOString();
    const added = priced.lines!.map((l) => ({ ...l, addedAt }));
    const lines: StoredLine[] = [...((order.items as StoredLine[] | null) ?? []), ...added];
    // Pay-later orders carry no discount or delivery fee (both settle at payment),
    // so the running total is exactly the sum of the lines.
    const total = linesTotalCents(lines) / 100;

    // Optimistic concurrency: two waiters adding at once, or a cashier
    // closing the tab mid-add, must not silently drop a round.
    const written = await prisma.$transaction(async (tx) => {
      const w = await tx.order.updateMany({
        where: { id, status: 'open', updatedAt: order.updatedAt },
        data: { items: lines as unknown as Prisma.InputJsonValue, total },
      });
      if (w.count === 1) await writeOrderItems(tx, id, added as CartLine[]);
      return w;
    });
    if (written.count === 0) {
      return res.status(409).json({ error: 'This order changed while you were adding — reload it and try again' });
    }

    const fresh = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    return res.json({ order: serializeOrder(fresh, await getOrderPrefix(prisma)), addedLines: added });
  } catch (err) {
    console.error(`POST /api/admin/orders/[id]/items (order ${id}):`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/admin/orders/:id/pay — take payment for an UNPAID pay-later
// dine-in order ('open' status internally) at the end of the meal. Cashier/manager only (money is
// taken at the counter). Closes the sale exactly like the Register's pay-now
// path (lib/orders/closeSale.ts): receipt #, closedAt, payment account, or an invoice
// for On account — one transaction, guarded so a tab is paid once.
export async function payOrder(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'orders', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    let body;
    try { body = readJson(req); } catch { body = null; }
    const parsed = payTabSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }
    const { discountType, discountValue, paymentMethod, accountId, payments, collectedById, ...rest } = parsed.data;

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'open') return res.status(409).json({ error: 'This order has already been paid or closed' });

    // The lines were priced from the database when each round was added —
    // the guests pay those prices even if the menu changed mid-meal.
    const lines = (order.items as StoredLine[] | null) ?? [];
    const totals = computeOrderTotals({
      totalCents: linesTotalCents(lines), discountType, discountValue, orderType: order.orderType, deliveryFee: 0,
    });
    if (totals.error) return res.status(400).json({ error: totals.error });
    const { subtotal, discount, total } = totals as { subtotal: number; discount: number; total: number };

    const payment = await resolveSalePayment(prisma, { paymentMethod, accountId, payments }, total);
    if (!payment.ok) return res.status(400).json({ error: payment.error });
    // Who took the money: the table's waiter by default (they collected at the table).
    // A waiter who has since been switched off can't be the default — the person taking payment is.
    const tableWaiter = order.waiterId
      ? await prisma.adminUser.findFirst({ where: { id: order.waiterId, isActive: true }, select: { id: true } })
      : null;
    const collector = await resolveCollector(prisma, auth.session!, collectedById ?? tableWaiter?.id ?? null);
    if (!collector.ok) return res.status(collector.status ?? 400).json({ error: collector.error });
    const close: CloseInput = { payment: payment.value, collectedById: collector.value, ...rest };
    const short = checkTendered(close, total);
    if (short) return res.status(400).json({ error: short });

    const invoiceId = await prisma.$transaction(async (tx) => {
      const customer = await resolveInvoiceCustomer(tx, close);
      const closed = await closedSaleFields(tx, close);
      const written = await tx.order.updateMany({
        where: { id, status: 'open', updatedAt: order.updatedAt },
        data: {
          ...closed,
          discount,
          total,
          // Reports credit the sale to whoever took the money; the waiter
          // who served the table stays on waiterId.
          staffId: auth.session!.userId,
          ...(customer ? { customerId: customer.id } : {}),
        },
      });
      if (written.count === 0) throw httpError('This order changed while you were taking payment — reload it and try again', 409);
      await writeClosedSaleEntries(tx, id, close, auth.session!.userId ?? null, closed.closedAt);
      if (!customer) return null;
      const invoice = await createSaleInvoice(tx, {
        orderId: id, customerId: customer.id, items: order.items as Prisma.InputJsonValue, subtotal, discount, total,
        dueDate: rest.invoiceDueDate, tableNumber: order.tableNumber, orderType: order.orderType, userId: auth.session!.userId,
      });
      return invoice.id;
    });

    const fresh = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    return res.json({ order: serializeOrder(fresh, await getOrderPrefix(prisma)), subtotal, invoiceId });
  } catch (err) {
    const e = err as { httpStatus?: number; message?: string };
    if (e.httpStatus) return res.status(e.httpStatus).json({ error: e.message });
    console.error(`POST /api/admin/orders/[id]/pay (order ${id}):`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
