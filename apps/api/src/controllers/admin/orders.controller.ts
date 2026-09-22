import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { ORDER_INCLUDE, serializeOrder } from '../../lib/orders/orderSerialize.js';
import { getOrderPrefix } from '../../lib/orders/orderCode.js';
import { searchParams as getSearchParams } from '../../utils/query.js';
import { dayKey, startOfDay } from '../../lib/time/businessTime.js';
import { stuckWhere } from '../../lib/payments/paymentReconciler.js';
import { updateOrderSchema } from '../../validations/orders.validation.js';
import { priceCart } from '../../lib/orders/cartPricing.js';
import { computeOrderTotals } from '../../lib/orders/orderTotals.js';
import { writeAdjustmentEntry } from '../../lib/money/cashBook.js';
import { audit } from '../../lib/db/audit.js';
import { assertOpenAt, periodClosed } from '../../lib/closing/dayClose.js';
import { readJson } from '../../utils/body.js';
import { resolveTable } from '../../lib/orders/tables.js';
import { replaceOrderItems, type CartLine } from '../../lib/orders/orderItems.js';

// Any back-office staff member (admin/manager/cashier) works the Orders page.
// Editing and voiding are manager-tier and gated in their own routes.
//
// The Orders page is LIVE work only: online orders waiting for a decision,
// unpaid dine-in orders, and whatever was created, closed or voided today
// (business day). Older history lives in Sales history (/api/admin/sales), so
// this list never grows with the years. `?status=open` lists just the unpaid
// dine-in orders, which every Register user (waiters included) needs in order
// to add a round.
const OPEN_TABS_CAP = 100;
const LIVE_CAP = 500;

/** What the Orders page shows: still needs someone, or touched today. */
export function liveWhere(now = new Date()): Prisma.OrderWhereInput {
  const today = startOfDay(dayKey(now));
  return {
    OR: [
      { status: { in: ['pending', 'open'] } },
      { createdAt: { gte: today } },
      { closedAt: { gte: today } },
      { voidedAt: { gte: today } },
    ],
  };
}

export async function listOrders(req: Request, res: Response) {
  const searchParams = getSearchParams(req);
  const openTabs = searchParams.get('status') === 'open';

  // The Register reads unpaid orders too; the live list is the Orders page.
  const auth = await requirePage(prisma, req, openTabs ? ['pos', 'orders'] : 'orders', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const since = parseInt(searchParams.get('since') ?? '0', 10);
  const source = searchParams.get('source'); // online | pos | (all)

  const where: Prisma.OrderWhereInput = openTabs ? { status: 'open' } : liveWhere();
  if (since > 0) where.id = { gt: since };
  if (source === 'online' || source === 'pos') where.source = source;

  try {
    const [orders, prefix] = await Promise.all([
      prisma.order.findMany({
        where,
        // Oldest tab first — the table that has waited longest.
        orderBy: { createdAt: openTabs ? 'asc' : 'desc' },
        include: ORDER_INCLUDE,
        take: openTabs ? OPEN_TABS_CAP : LIVE_CAP,
      }),
      getOrderPrefix(prisma),
    ]);
    return res.json(orders.map((o) => serializeOrder(o, prefix)));
  } catch (err) {
    console.error('GET /api/admin/orders:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/orders/counts — the numbers behind the sidebar/bell badges:
// online orders waiting for a decision, unpaid dine-in orders, and online
// payments stuck without an order (Orders › Online payments). Counts only, so
// the badge never downloads a list. Back-office staff.
export async function getOrderCounts(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'orders', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    const [pending, unpaid, stuckPayments] = await Promise.all([
      prisma.order.count({ where: { status: 'pending' } }),
      prisma.order.count({ where: { status: 'open' } }),
      prisma.paymentSession.count({ where: stuckWhere(new Date()) }),
    ]);
    return res.json({ pending, unpaid, stuckPayments });
  } catch (err) {
    console.error('GET /api/admin/orders/counts:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Editing a completed sale rewrites money already counted in the day's
// revenue — a manager-tier call whatever the Orders permission says. Checked
// inline after requirePage('orders','act').
const EDIT_ROLES = ['admin', 'manager'];

const round2 = (n: number) => Math.round(n * 100) / 100;
const httpError = (message: string, httpStatus: number) => Object.assign(new Error(message), { httpStatus });

function parseId(raw: string) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : null;
}

export async function getOrder(req: Request<{ id: string }>, res: Response) {
  // One order opens from Orders or from Sales history — but a waiter only
  // through Orders (Sales history shows waiters their own rows, not detail).
  const auth = await requirePage(prisma, req, ['orders', 'sales'], 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.session.role === 'waiter') {
    const own = await requirePage(prisma, req, 'orders', 'view');
    if (own.error) return res.status(own.status).json({ error: own.error });
  }

  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Invalid id' });

  try {
    const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    return res.json(serializeOrder(order, await getOrderPrefix(prisma)));
  } catch (err) {
    console.error(`GET /api/admin/orders/[id] (order ${id}):`, err);
    return res.status(500).json({ error: 'Internal server error' });
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
 *  - pending orders (awaiting accept/decline) and orders paid online
 *    (the gateway cannot adjust a captured amount) are not editable — void them.
 *  - A linked invoice's items/subtotal/discount/total are rewritten in the SAME
 *    transaction; its status is re-derived from amountPaid, never set directly,
 *    and a total below amountPaid is refused (the schema can't hold a credit).
 */
export async function updateOrder(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'orders', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!EDIT_ROLES.includes(auth.session!.role as string)) {
    return res.status(403).json({ error: 'Only a manager can edit an order' });
  }

  const id = parseId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'Invalid id' });

  try {
    // Mirrors `await request.json().catch(() => null)`.
    let body;
    try { body = readJson(req); } catch { body = null; }
    if (!body) return res.status(400).json({ error: 'Invalid input' });
    const parsed = updateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }
    const {
      items, orderType, tableNumber: tableInput, discountType, discountValue,
      deliveryFee, contactName, contactPhone, address, notes, editReason,
    } = parsed.data;
    // With tables defined, a dine-in order must sit at one of them ("T5" = "Table 5" = "5").
    let tableNumber: string | null | undefined = tableInput;
    if (orderType === 'dine_in') {
      const table = await resolveTable(prisma, tableInput);
      if (!table.ok) return res.status(400).json({ error: table.error });
      tableNumber = table.value;
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: { invoice: { select: { id: true, status: true } } },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // ── Which orders may be edited at all ────────────────────────────────
    if (order.status === 'pending') {
      return res.status(409).json({ error: 'Accept or decline this order first — the paid amount of an online order cannot be changed' });
    }
    if (order.status !== 'confirmed' && order.status !== 'open') {
      return res.status(409).json({ error: `A ${order.status} order cannot be edited` });
    }
    // An unpaid pay-later order stays dine-in with no discount — the discount is
    // applied when the tab is paid (POST /orders/:id/pay).
    if (order.status === 'open' && (orderType !== 'dine_in' || discountType)) {
      return res.status(409).json({ error: 'An unpaid order stays dine-in, and its discount is applied when taking payment' });
    }
    if (order.paymentStatus === 'refunded') {
      return res.status(409).json({ error: 'A refunded order cannot be edited' });
    }
    // The customer paid online (Sifalo, or legacy Waafi) for exactly this
    // total; the gateway can't adjust a captured amount.
    if (order.paymentTransactionId && order.paymentStatus === 'paid') {
      return res.status(409).json({ error: 'This sale was paid online, and the captured amount cannot be adjusted — void the order instead of editing it' });
    }
    if (order.invoice && order.invoice.status === 'void') {
      return res.status(409).json({ error: "This order's invoice has been voided — the sale is closed" });
    }

    // ── Reprice + recompute server-side, before opening the transaction ──
    const priced = await priceCart(prisma, items);
    if (priced.error) {
      // 409, not the create route's 400: the rejected line may be a historical
      // line the manager never touched whose menu item has since been removed.
      return res.status(409).json({ error: `${priced.error}. Remove that line, or void the order instead.` });
    }
    const pricedLines = priced.lines as unknown as Prisma.InputJsonValue;
    const totals = computeOrderTotals({ totalCents: priced.totalCents!, discountType, discountValue, orderType, deliveryFee });
    if (totals.error) return res.status(400).json({ error: totals.error });
    const { subtotal, discount, delivery, total } = totals as { subtotal: number; discount: number; delivery: number; total: number };
    const previousTotal = Number(order.total);

    // ── One transaction: order + invoice, all or nothing ────────────────
    await prisma.$transaction(async (tx) => {
      // A sale that closed in a locked day can't be rewritten: void it (refunds today) and ring it again.
      if (order.closedAt) {
        try { await assertOpenAt(tx, order.closedAt); } catch { throw periodClosed(`The day this sale closed on`); }
      }
      // Optimistic concurrency (no row locks without raw SQL): the row must
      // still look exactly as it did when we priced it.
      const written = await tx.order.updateMany({
        where: { id: order.id, status: order.status, paymentStatus: order.paymentStatus, updatedAt: order.updatedAt },
        data: {
          items: pricedLines,
          total,
          discount,
          deliveryFee: delivery,
          orderType,
          // Same field mapping as the create route: non-delivery notes live in `address`.
          tableNumber: orderType === 'dine_in' ? (tableNumber || null) : null,
          contactName: orderType === 'delivery' ? (contactName || null) : null,
          contactPhone: orderType === 'delivery' ? (contactPhone || null) : null,
          address: orderType === 'delivery' ? (address || null) : (notes || null),
          editedById: auth.session!.userId,
          editedAt: new Date(),
          editReason,
        },
      });
      if (written.count === 0) throw httpError('This order changed while you were editing it — reload and try again', 409);
      await replaceOrderItems(tx, order.id, pricedLines as unknown as CartLine[]);

      await audit(tx, auth.session!.userId, 'order.edit', 'Order', order.id, { reason: editReason, totalBefore: previousTotal, totalAfter: total });
      // A paid sale whose total changed: the difference moves through its account.
      if (order.paymentStatus === 'paid') {
        await writeAdjustmentEntry(tx, order, round2(total - previousTotal), { createdById: auth.session!.userId ?? null, note: `Edit: ${editReason}` });
      }

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
      // Identical derivation to recordInvoicePayment (invoices.controller.ts).
      const status = amountPaid >= total ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';

      const invWritten = await tx.invoice.updateMany({
        // Guarded: a payment could commit between the read above and this write.
        where: { id: current.id, amountPaid: current.amountPaid, status: current.status },
        data: {
          items: pricedLines,
          subtotal,
          discount,
          // Includes the delivery fee, exactly as createPosOrder (pos.controller.ts) creates it.
          total,
          status,
          tableNumber: orderType === 'dine_in' ? (tableNumber || null) : null,
          orderType,
        },
      });
      if (invWritten.count === 0) throw httpError('A payment was recorded on this invoice while you were editing — reload and try again', 409);
    });

    const fresh = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    return res.json({
      order: serializeOrder(fresh, await getOrderPrefix(prisma)),
      subtotal: subtotal.toFixed(2),
      previousTotal: previousTotal.toFixed(2),
      // What the drawer owes back (negative) or is owed (positive) after the edit.
      totalDelta: round2(total - previousTotal).toFixed(2),
    });
  } catch (err) {
    const e = err as { httpStatus?: number; message?: string };
    if (e.httpStatus) return res.status(e.httpStatus).json({ error: e.message });
    console.error(`PATCH /api/admin/orders/[id] (order ${id}):`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
