// Turning a Sifalo hosted-checkout payment into an Order.
//
// Invariants (the money rules — every path goes through finalizePayment):
//  • An Order is created only after Sifalo's verify says paid (success/601)
//    for EXACTLY the session amount in USD.
//  • The sid must belong to this checkout: verify-by-order_id(reference) has to
//    return the same sid. verify.php is unauthenticated, so without this a sid
//    from another payment (or another merchant) could be replayed.
//  • One sid pays for one order (Order.paymentTransactionId is @unique) and one
//    reference yields one order (Order.reference is @unique) — so the browser
//    return, a refresh and the status poll can all race safely: whoever loses
//    the unique race just reads the winner's order.
//  • Never treat "unreachable" as failed — it stays pending and is re-verified.
import type { Response } from 'express';
import { SignJWT } from 'jose';
import type { Prisma } from '@prisma/client';
import prisma from '../db/prisma.js';
import { verify, gatewayForPaymentType, chargedAmount } from './sifalo.js';
import { toCents } from '../orders/cartPricing.js';
import { jwtSecret } from '../auth/auth.js';
import { primaryAccount, writeSaleEntries } from '../money/cashBook.js';
import { env } from '../../config/env.js';
import { errCode } from '../../utils/errors.js';
import { nextReceiptNo } from '../orders/receiptNo.js';
import { writeOrderItems, type CartLine } from '../orders/orderItems.js';
import { publishOrdersChanged } from '../orders/orderEvents.js';

export type FinalizeResult =
  | { state: 'paid'; reference: string; clientId: number | null }
  | { state: 'pending'; reference: string }
  | { state: 'failed'; reference: string; reason: string };

const failed = (reference: string, reason: string): FinalizeResult => ({ state: 'failed', reference, reason });

async function existingOrder(reference: string): Promise<FinalizeResult | null> {
  const order = await prisma.order.findUnique({ where: { reference }, select: { reference: true, clientId: true } });
  return order ? { state: 'paid', reference: order.reference, clientId: order.clientId } : null;
}

/**
 * Idempotent: safe to call from the return redirect, a page refresh, the
 * status poll, the server-side reconciler and a staff re-check at the same
 * time. `sidFromReturn` is the sid Sifalo appended to the return URL (absent
 * otherwise — the stored one is used). Every outcome that is not "paid" is
 * written onto the checkout (lastResult), so staff can see why an online
 * payment has no order yet.
 */
export async function finalizePayment(
  reference: string,
  sidFromReturn?: string | null,
  // createOrder:false = check only: a confirmed payment is reported as
  // failed('paid_late') instead of becoming an order (the reconciler, for
  // checkouts too old to act on without a person — lib/payments/paymentReconciler.ts).
  opts: { createOrder?: boolean } = {},
): Promise<FinalizeResult> {
  const result = await settle(reference, sidFromReturn, opts.createOrder ?? true);
  if (result.state === 'paid') publishOrdersChanged();
  else await recordCheck(reference, result.state === 'pending' ? 'pending' : result.reason);
  return result;
}

/** Reconciler bookkeeping on the checkout. A paid one is already deleted (0 rows). */
async function recordCheck(reference: string, lastResult: string) {
  try {
    await prisma.paymentSession.updateMany({
      where: { reference },
      data: { lastResult, lastCheckedAt: new Date(), checkCount: { increment: 1 } },
    });
  } catch (err) {
    // Bookkeeping only — the payment outcome itself is already decided.
    console.error(`payments: could not record check result "${lastResult}" on ${reference}:`, err);
  }
}

async function settle(reference: string, sidFromReturn: string | null | undefined, createOrder: boolean): Promise<FinalizeResult> {
  const done = await existingOrder(reference);
  if (done) return done;

  const session = await prisma.paymentSession.findUnique({ where: { reference } });
  if (!session) return failed(reference, 'session_not_found');

  // Remember the sid so a pending payment can be polled later.
  let sid = sidFromReturn || session.sid;
  if (sidFromReturn && sidFromReturn !== session.sid) {
    try {
      await prisma.paymentSession.update({ where: { reference }, data: { sid: sidFromReturn } });
    } catch (err) {
      // P2002: this sid is already attached to another checkout — a replay.
      if (errCode(err) === 'P2002') {
        console.error(`payments: sid ${sidFromReturn} replayed onto checkout ${reference}`);
        return failed(reference, 'sid_reused');
      }
      throw err;
    }
  }

  // The payment as Sifalo records it for OUR order id — also how a poll finds
  // the sid when the customer never made it back to the return URL.
  const byOrder = await verify({ order_id: reference });
  if (!sid) sid = byOrder.sid;
  if (!sid) return byOrder.unreachable ? { state: 'pending', reference } : failed(reference, 'no_payment');

  const payment = byOrder.sid === sid ? byOrder : await verify({ sid });
  if (payment.state === 'pending') return { state: 'pending', reference };
  if (payment.state === 'failed') return failed(reference, `declined_${payment.code ?? 'unknown'}`);

  // Paid — now prove it is THIS checkout's payment, for THIS amount.
  if (byOrder.unreachable) return { state: 'pending', reference };
  if (byOrder.sid !== sid) {
    console.error(`payments: sid ${sid} is not the payment Sifalo holds for order_id ${reference} (got ${byOrder.sid ?? 'none'})`);
    return failed(reference, 'sid_not_bound_to_order');
  }
  if ((payment.currency ?? '').toUpperCase() !== 'USD') return failed(reference, 'currency_mismatch');
  if (toCents(payment.amount) !== toCents(chargedAmount(session.amount))) {
    console.error(`payments: amount mismatch on ${reference}: paid ${payment.amount}, expected ${chargedAmount(session.amount)}`);
    return failed(reference, 'amount_mismatch');
  }

  // Verified and paid — but a check-only call leaves the order to a person.
  if (!createOrder) return failed(reference, 'paid_late');

  const cart = session.cartJson as Prisma.InputJsonValue;
  try {
    const order = await prisma.$transaction(async (tx) => {
      // The online payer (not a back-office Customer): refreshed by phone, and a
      // dine-in order (no address) keeps the last delivery address on file.
      const client = await tx.onlineClient.upsert({
        where: { phone: session.phone },
        update: { name: session.name, ...(session.address ? { address: session.address } : {}) },
        create: { phone: session.phone, name: session.name, address: session.address },
      });
      // Paid online = the sale is closed now; it takes today's next receipt #.
      const closedAt = new Date();
      const { receiptDay, receiptNo } = await nextReceiptNo(tx, closedAt);
      const created = await tx.order.create({
        data: {
          closedAt,
          receiptDay,
          receiptNo,
          clientId: client.id,
          items: cart,
          total: session.amount,
          address: session.address,
          orderType: session.orderType,
          tableNumber: session.tableNumber,
          // Money is captured at checkout; the kitchen still accepts/declines.
          status: 'pending',
          paymentStatus: 'paid',
          paymentMethod: gatewayForPaymentType(payment.paymentType),
          paymentTransactionId: sid,
          reference,
        },
      });
      await writeOrderItems(tx, created.id, cart as unknown as CartLine[]);
      // Online money lands in the business's Sifalo account — never tagged to staff.
      const gateway = await primaryAccount(tx, 'gateway');
      if (gateway) {
        await writeSaleEntries(tx, { orderId: created.id, parts: [{ account: gateway, amount: Number(session.amount) }], collectedById: null, createdById: null, at: closedAt });
      } else {
        // Never refuse a payment the customer already made — record it and say so.
        console.error(`payments: no active gateway account — online sale ${reference} has no cash-book row`);
      }
      await tx.paymentSession.delete({ where: { reference } });
      return created;
    });
    return { state: 'paid', reference, clientId: order.clientId };
  } catch (err) {
    if (errCode(err) === 'P2002') {
      // Lost a race to another finalize for this reference — use its order.
      const winner = await existingOrder(reference);
      if (winner) return winner;
      console.error(`payments: sid ${sid} already paid for a different order (checkout ${reference})`);
      return failed(reference, 'sid_reused');
    }
    throw err;
  }
}

// Long-lived online-client session for checkout prefill (read by
// /api/customer/me and accepted by /api/auth/set-cookie).
const CUSTOMER_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

export async function setCustomerCookie(res: Response, clientId: number) {
  const token = await new SignJWT({ clientId, type: 'customer' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(jwtSecret());
  res.cookie('customer_session', token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: CUSTOMER_COOKIE_MAX_AGE_S * 1000,
  });
}
