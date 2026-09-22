import type { Request, Response } from 'express';
import prisma from '../lib/db/prisma.js';
import { chargedAmount, startCheckout } from '../lib/payments/sifalo.js';
import { env } from '../config/env.js';
import { readJson } from '../utils/body.js';
import { finalizePayment, setCustomerCookie } from '../lib/payments/payments.js';
import { searchParams } from '../utils/query.js';

// POST /api/payment/initiate { reference } → { checkoutUrl }
// Opens a Sifalo hosted-checkout session for a checkout created by
// POST /api/checkout. The amount is the session's server-priced total — the
// client never supplies it. The customer is redirected to checkoutUrl and
// comes back to GET /api/payment/return.
export async function initiatePayment(req: Request, res: Response) {
  try {
    const { reference } = readJson<{ reference?: unknown }>(req);
    if (typeof reference !== 'string' || !reference) {
      return res.status(400).json({ error: 'reference required' });
    }

    // Already paid (e.g. a double-tap after a slow redirect) — never open a
    // second payment for the same checkout.
    const paid = await prisma.order.findUnique({ where: { reference }, select: { reference: true } });
    if (paid) return res.status(409).json({ error: 'already_paid', reference });

    const session = await prisma.paymentSession.findUnique({ where: { reference } });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const returnUrl = new URL('/api/payment/return', env.PUBLIC_APP_URL);
    returnUrl.searchParams.set('order_id', reference);

    const started = await startCheckout({
      amount: chargedAmount(session.amount),
      returnUrl: returnUrl.toString(),
    });
    if (!started.ok) {
      console.error(`POST /api/payment/initiate (${reference}): ${started.error}`);
      return res.status(502).json({ error: 'failed' });
    }

    // From now on the customer may pay, so the reconciler watches this checkout
    // (lib/payments/paymentReconciler.ts) even if their browser never comes back.
    await prisma.paymentSession.update({ where: { reference }, data: { initiatedAt: new Date() } });

    return res.json({ checkoutUrl: started.checkoutUrl, reference });
  } catch (err) {
    console.error('POST /api/payment/initiate:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/payment/return?order_id=<reference>&sid=<sid>
// Where Sifalo sends the customer's browser after hosted checkout. Verifies
// server-side (the query string itself proves nothing), then redirects back
// into the menu app:
//   paid    → /?ref=<reference>                 (server-rendered confirmation)
//   pending → /?pay=pending&payref=<reference>  (client polls /api/payment/status)
//   failed  → /?pay=failed
const back = (res: Response, query: Record<string, string>) =>
  res.redirect(303, `/?${new URLSearchParams(query).toString()}`);

export async function paymentReturn(req: Request, res: Response) {
  const params = searchParams(req);
  const reference = params.get('order_id');
  const sid = params.get('sid');
  if (!reference) return back(res, { pay: 'failed' });

  try {
    const result = await finalizePayment(reference, sid);
    if (result.state === 'paid') {
      if (result.clientId) await setCustomerCookie(res, result.clientId);
      return back(res, { ref: result.reference });
    }
    if (result.state === 'pending') return back(res, { pay: 'pending', payref: reference });
    console.warn(`GET /api/payment/return (${reference}): ${result.reason}`);
    return back(res, { pay: 'failed' });
  } catch (err) {
    console.error(`GET /api/payment/return (${reference}):`, err);
    // State unknown — let the client re-check instead of claiming failure.
    return back(res, { pay: 'pending', payref: reference });
  }
}

// POST /api/payment/status { reference } → { state: 'paid'|'pending'|'failed', reference }
// Polled by the menu while a Sifalo payment is still pending. Same idempotent
// finalize as the return redirect, so polling and returning can overlap.
export async function paymentStatus(req: Request, res: Response) {
  try {
    const { reference } = readJson<{ reference?: unknown }>(req);
    if (typeof reference !== 'string' || !reference || reference.length > 100) {
      return res.status(400).json({ error: 'reference required' });
    }

    const result = await finalizePayment(reference);
    if (result.state === 'paid' && result.clientId) await setCustomerCookie(res, result.clientId);
    // The failure reason stays in server logs — the customer only needs the state.
    return res.json({ state: result.state, reference: result.reference });
  } catch (err) {
    console.error('POST /api/payment/status:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
