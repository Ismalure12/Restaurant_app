import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../../lib/db/prisma.js';
import { requireRole, MANAGER_ROLES, requirePage } from '../../lib/auth/auth.js';
import { searchParams as getSearchParams } from '../../utils/query.js';
import { stuckWhere } from '../../lib/payments/paymentReconciler.js';
import { ONLINE_PAYMENT_SELECT, serializeOnlinePayment } from '../../lib/payments/onlinePayments.js';
import { finalizePayment } from '../../lib/payments/payments.js';
import { dismissPaymentSchema } from '../../validations/payments.validation.js';
import { readJson } from '../../utils/body.js';
import { audit } from '../../lib/db/audit.js';
import { publishOrdersChanged } from '../../lib/orders/orderEvents.js';

// GET /api/admin/online-payments — checkouts the customer was sent to pay at
// Sifalo that have no order (yet): still being checked, stuck, not paid, or
// needing attention. Back-office staff. Newest first, cursor-paged.
// ?filter=stuck → only the ones counted on the Orders badge.
export async function listOnlinePayments(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'orders', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const params = getSearchParams(req);
  const take = Math.min(Math.max(parseInt(params.get('limit') ?? '50', 10) || 50, 1), 100);
  const cursor = parseInt(params.get('cursor') ?? '', 10);
  const now = new Date();
  const where: Prisma.PaymentSessionWhereInput =
    params.get('filter') === 'stuck' ? stuckWhere(now) : { initiatedAt: { not: null } };

  try {
    const rows = await prisma.paymentSession.findMany({
      where,
      orderBy: { id: 'desc' },
      take: take + 1,
      ...(Number.isFinite(cursor) ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: ONLINE_PAYMENT_SELECT,
    });
    const page = rows.slice(0, take);
    return res.json({
      payments: page.map((r) => serializeOnlinePayment(r, now)),
      nextCursor: rows.length > take ? page[page.length - 1].id : null,
    });
  } catch (err) {
    console.error('GET /api/admin/online-payments:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/admin/online-payments/:id/recheck — ask Sifalo again now (a
// customer is on the phone saying they paid). Same idempotent finalize as the
// customer's own return: if Sifalo confirms, the order is created and appears
// in Orders. Back-office staff.
export async function recheckOnlinePayment(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'orders', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

  try {
    const session = await prisma.paymentSession.findUnique({ where: { id }, select: { reference: true, initiatedAt: true } });
    if (!session || !session.initiatedAt) return res.status(404).json({ error: 'Online payment not found' });

    const result = await finalizePayment(session.reference);
    if (result.state === 'paid') {
      const order = await prisma.order.findUnique({ where: { reference: session.reference }, select: { id: true } });
      return res.json({ state: 'paid', orderId: order?.id ?? null });
    }
    const fresh = await prisma.paymentSession.findUnique({ where: { id }, select: ONLINE_PAYMENT_SELECT });
    return res.json({ state: result.state, payment: fresh ? serializeOnlinePayment(fresh) : null });
  } catch (err) {
    console.error(`POST /api/admin/online-payments/${id}/recheck:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/admin/online-payments/:id/dismiss { reason } — a manager removes a
// checkout that will never become an order (customer called, money refunded
// in the Sifalo portal, a test). Sifalo is asked ONE more time first: a
// checkout that turns out to be paid becomes its order instead of being thrown
// away, and one Sifalo can't answer for stays. Audited.
export async function dismissOnlinePayment(req: Request<{ id: string }>, res: Response) {
  const auth = await requireRole(prisma, req, MANAGER_ROLES);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
  const parsed = dismissPaymentSchema.safeParse(readJson(req) ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });

  try {
    const session = await prisma.paymentSession.findUnique({ where: { id } });
    if (!session || !session.initiatedAt) return res.status(404).json({ error: 'Online payment not found' });

    // A late paid checkout (paid_late) is exactly what a manager dismisses
    // after handling it by hand — don't turn it into an order now.
    const result = session.lastResult === 'paid_late'
      ? { state: 'failed' as const, reason: 'paid_late' }
      : await finalizePayment(session.reference);
    if (result.state === 'paid') {
      const order = await prisma.order.findUnique({ where: { reference: session.reference }, select: { id: true } });
      return res.status(409).json({ error: 'Sifalo confirms this payment — its order has just been created, so it was not dismissed', orderId: order?.id ?? null });
    }
    if (result.state === 'pending') {
      return res.status(409).json({ error: 'Sifalo still shows this payment as pending (or cannot be reached) — try again in a few minutes' });
    }

    await prisma.$transaction(async (tx) => {
      await audit(tx, auth.session!.userId, 'online_payment.dismiss', 'payment_session', id, {
        reason: parsed.data.reason, name: session.name, phone: session.phone,
        amount: Number(session.amount), lastResult: result.reason,
      });
      await tx.paymentSession.deleteMany({ where: { id } });
    });
    publishOrdersChanged();
    return res.json({ ok: true });
  } catch (err) {
    console.error(`POST /api/admin/online-payments/${id}/dismiss:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
