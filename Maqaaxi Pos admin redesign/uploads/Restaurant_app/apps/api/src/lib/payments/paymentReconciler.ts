// Server-side safety net for Sifalo hosted checkout (Sifalo has no webhook).
//
// Normally the customer's browser confirms a payment: Sifalo redirects it to
// /api/payment/return, or the confirmation page polls /api/payment/status. If
// the phone loses signal right after the PIN, neither happens — the money is
// taken but no order exists. This loop asks Sifalo itself, by our order_id,
// for every checkout the customer was sent to pay, until it is paid (→ the
// order is created exactly as the browser would have), clearly not paid, or
// 48 h old. finalizePayment is idempotent, so racing the browser is safe.
//
// What staff see in Orders › Online payments comes from the same fields
// (listing + classification below).
import type { Prisma } from '@prisma/client';
import prisma from '../db/prisma.js';
import { finalizePayment } from './payments.js';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Keep asking Sifalo for this long after checkout. */
export const WATCH_WINDOW_MS = 48 * HOUR;
/** A checkout nobody was ever sent to pay for is dropped after this. */
export const UNINITIATED_TTL_MS = 24 * HOUR;
/** A payment still unconfirmed after this long is shown to staff as stuck. */
export const STUCK_AFTER_MS = 15 * MIN;
export const TICK_MS = MIN;
const PER_TICK = 20;

// Wait before check N+1: quick at first (most payments settle within a
// minute), then rarely, so a long-abandoned checkout costs Sifalo little.
const BACKOFF_MIN = [1, 2, 5, 10, 30, 60];
export const delayAfterCheck = (checkCount: number) =>
  BACKOFF_MIN[Math.min(checkCount, BACKOFF_MIN.length - 1)] * MIN;

/**
 * Outcomes where money may have moved but no order could be created — a
 * person must look. Re-asking Sifalo will not change them, so the loop stops
 * and cleanup never deletes them (only a manager's Dismiss does).
 */
export const ATTENTION_RESULTS = ['amount_mismatch', 'currency_mismatch', 'sid_not_bound_to_order', 'sid_reused', 'paid_late'];

const isNotPaid = (r: string | null) => r === 'no_payment' || (r?.startsWith('declined_') ?? false);

type Tracked = { createdAt: Date; initiatedAt: Date | null; lastCheckedAt: Date | null; checkCount: number; lastResult: string | null };

export function isDue(s: Tracked, now: Date): boolean {
  if (!s.initiatedAt) return false;
  if (s.lastResult && ATTENTION_RESULTS.includes(s.lastResult)) return false;
  // Every checkout is asked about at least once, however old (a checkout
  // from before the reconciler existed may still hide a payment).
  if (!s.lastCheckedAt) return true;
  if (now.getTime() - s.createdAt.getTime() > WATCH_WINDOW_MS) return false;
  return now.getTime() - s.lastCheckedAt.getTime() >= delayAfterCheck(s.checkCount);
}

export type PaymentStatus = 'checking' | 'stuck' | 'not_paid' | 'attention';

/**
 * checking  — just started / still pending at Sifalo, give it a minute
 * stuck     — started > 15 min ago and Sifalo still hasn't confirmed either way
 * not_paid  — Sifalo says there is no successful payment (never paid / declined)
 * attention — Sifalo reports a payment we could not accept (see ATTENTION_RESULTS)
 */
export function classify(s: Tracked, now: Date): PaymentStatus {
  if (s.lastResult && ATTENTION_RESULTS.includes(s.lastResult)) return 'attention';
  if (isNotPaid(s.lastResult)) return 'not_paid';
  const since = s.initiatedAt ?? s.createdAt;
  return now.getTime() - since.getTime() > STUCK_AFTER_MS ? 'stuck' : 'checking';
}

/** What a result means, for staff (never shown to the customer). */
export function reasonText(lastResult: string | null): string {
  if (!lastResult) return 'Not checked yet';
  if (lastResult === 'pending') return 'Sifalo says the payment is still pending (or could not be reached)';
  if (lastResult === 'no_payment') return 'Sifalo has no payment for this checkout — the customer did not finish paying';
  if (lastResult.startsWith('declined_')) return `Payment was declined or cancelled at Sifalo (code ${lastResult.slice('declined_'.length)})`;
  switch (lastResult) {
    case 'amount_mismatch': return 'Sifalo reports a payment for a different amount — check the Sifalo portal before refunding or making the order';
    case 'currency_mismatch': return 'Sifalo reports a payment in a currency other than USD — check the Sifalo portal';
    case 'sid_not_bound_to_order': return 'The payment reference does not match this checkout — check the Sifalo portal';
    case 'sid_reused': return 'This payment reference already paid for another order — check the Sifalo portal';
    case 'paid_late': return 'Sifalo shows this checkout as PAID, but it is more than 48 hours old and never became an order — check whether it was already handled. "Check with Sifalo now" creates the order; Dismiss if it was sorted out by hand';
    case 'session_not_found': return 'Checkout not found';
    default: return lastResult;
  }
}

/** Checkouts whose status staff should look at (the Orders badge). */
export function stuckWhere(now: Date): Prisma.PaymentSessionWhereInput {
  return {
    initiatedAt: { not: null },
    OR: [
      { lastResult: { in: ATTENTION_RESULTS } },
      {
        initiatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) },
        // Not yet checked (NULL) or not a clear "not paid". The NULL branch is
        // explicit: in SQL, NOT (last_result = …) is NULL — not true — for NULL.
        OR: [
          { lastResult: null },
          { AND: [{ lastResult: { not: 'no_payment' } }, { NOT: { lastResult: { startsWith: 'declined_' } } }] },
        ],
      },
    ],
  };
}

/** Drops checkouts that can no longer turn into money. Never touches ATTENTION ones. */
export async function cleanup(now: Date) {
  const [uninitiated, notPaid] = await Promise.all([
    prisma.paymentSession.deleteMany({
      where: { initiatedAt: null, createdAt: { lt: new Date(now.getTime() - UNINITIATED_TTL_MS) } },
    }),
    prisma.paymentSession.deleteMany({
      where: {
        createdAt: { lt: new Date(now.getTime() - WATCH_WINDOW_MS) },
        OR: [{ lastResult: 'no_payment' }, { lastResult: { startsWith: 'declined_' } }],
      },
    }),
  ]);
  return uninitiated.count + notPaid.count;
}

/** One pass: ask Sifalo about every checkout that is due, then clean up. */
export async function reconcileOnce(now = new Date()) {
  // Candidates by oldest check first; the backoff itself is per row, so it is
  // applied here rather than in SQL. Bounded: at most PER_TICK Sifalo calls.
  const candidates = await prisma.paymentSession.findMany({
    where: {
      initiatedAt: { not: null },
      AND: [
        // Inside the watch window, or never asked about yet (one check, any age).
        { OR: [{ createdAt: { gte: new Date(now.getTime() - WATCH_WINDOW_MS) } }, { lastCheckedAt: null }] },
        { OR: [{ lastResult: null }, { lastResult: { notIn: ATTENTION_RESULTS } }] },
      ],
    },
    orderBy: [{ lastCheckedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
    select: { reference: true, createdAt: true, initiatedAt: true, lastCheckedAt: true, checkCount: true, lastResult: true },
    take: 200,
  });
  const due = candidates.filter((s) => isDue(s, now)).slice(0, PER_TICK);

  let paid = 0;
  // One external Sifalo call per checkout, one after another — never a burst.
  for (const s of due) {
    try {
      // Past the watch window an order is never created unattended: it may
      // already have been handled by hand — a paid one is flagged 'paid_late'.
      const late = now.getTime() - s.createdAt.getTime() > WATCH_WINDOW_MS;
      const result = await finalizePayment(s.reference, null, { createOrder: !late });
      if (result.state === 'paid') {
        paid += 1;
        console.log(`reconciler: payment for ${s.reference} confirmed server-side — order created`);
      } else if (result.state === 'failed' && ATTENTION_RESULTS.includes(result.reason)) {
        console.error(`reconciler: ${s.reference} needs staff attention (${result.reason})`);
      }
    } catch (err) {
      console.error(`reconciler: checking ${s.reference} failed:`, err);
    }
  }

  let removed = 0;
  try {
    removed = await cleanup(now);
  } catch (err) {
    console.error('reconciler: cleanup failed:', err);
  }
  return { checked: due.length, paid, removed };
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Starts the loop (one per API process). Overlapping ticks are skipped. */
export function startReconciler() {
  if (timer) return;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    reconcileOnce()
      .catch((err) => console.error('reconciler: tick failed:', err))
      .finally(() => { running = false; });
  }, TICK_MS);
  timer.unref();
}

export function stopReconciler() {
  if (timer) clearInterval(timer);
  timer = null;
}
