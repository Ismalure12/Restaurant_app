// Sifalo Pay client — hosted checkout, verify and refund.
// Docs: https://developer.sifalopay.com/docs/hosted-checkout
//
//   startCheckout → POST {gateway}/  (Basic auth) → { key, token } → customer
//                   is sent to {checkout}/?key&token and comes back to
//                   return_url&sid=…
//   verify        → POST {gateway}/verify.php (no auth) — paid only when
//                   status === 'success' && code === 601
//   refund        → POST {gateway}/  (Basic auth, payment_type: 'refund')
//
// Always the live gateway (real wallets, PIN-approved by the payer) — there is
// no staging mode.
import { env } from '../../config/env.js';

const HOSTS = { gateway: 'https://api.sifalopay.com/gateway/', checkout: 'https://pay.sifalo.com/checkout/' } as const;

// TEST CHARGE: while set, every checkout/refund sent to Sifalo uses this amount
// instead of the order total, and finalizePayment expects it back. Set to `null`
// when deploying to charge the real total. Orders and the cash book still keep
// the real menu total.
export const FIXED_CHARGE_USD: string | null = '0.01';

/** The USD amount that actually goes to Sifalo (and must come back from verify) for an order of `real`. */
export const chargedAmount = (real: number | string | { toString(): string }): string =>
  FIXED_CHARGE_USD ?? Number(real.toString()).toFixed(2);

// Sifalo asks callers to allow 120s; stay a little under so our own response
// (and any ~120s proxy in front of us) never times out first.
const TIMEOUT_MS = 110_000;

export const hosts = () => HOSTS;

// Sifalo payment_type → our Order.paymentMethod, which is also the `gateway`
// value a refund must be sent with.
const GATEWAY_BY_PAYMENT_TYPE: Record<string, string> = {
  ZAAD: 'waafi',
  WAAFI: 'waafi',
  EVC: 'waafi',
  SAHAL: 'waafi',
  EDAHAB: 'edahab',
  'PREMIER WALLET': 'pbwallet',
  CARD: 'card',
};
export const gatewayForPaymentType = (t: string | null | undefined) =>
  (t && GATEWAY_BY_PAYMENT_TYPE[t.toUpperCase()]) || 'sifalo';

type Json = Record<string, unknown>;

async function post(url: string, body: Json, withAuth: boolean): Promise<{ ok: true; data: Json } | { ok: false; error: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${env.SIFALO_API_USER}:${env.SIFALO_API_KEY}`).toString('base64')}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    const data = (await res.json().catch(() => null)) as Json | null;
    if (!data) return { ok: false, error: `Sifalo returned HTTP ${res.status} without JSON` };
    return { ok: true, data };
  } catch (err) {
    const e = err as { name?: string; message?: string };
    return { ok: false, error: e?.name === 'AbortError' ? 'Sifalo timeout' : (e?.message || 'network error') };
  } finally {
    clearTimeout(timer);
  }
}

const str = (v: unknown) => (v == null ? null : String(v));

export type StartResult = { ok: true; checkoutUrl: string } | { ok: false; error: string };

/** Opens a hosted-checkout session for `amount` USD. */
export async function startCheckout({ amount, returnUrl }: { amount: string; returnUrl: string }): Promise<StartResult> {
  const r = await post(hosts().gateway, { amount, gateway: 'checkout', currency: 'USD', return_url: returnUrl }, true);
  if (!r.ok) return r;
  const { key, token } = r.data;
  if (typeof key !== 'string' || typeof token !== 'string' || !key || !token) {
    // code 0 = bad credentials, 404 = missing field (per Sifalo's code table).
    return { ok: false, error: `Sifalo refused the session (code ${str(r.data.code)}: ${str(r.data.response) ?? 'no message'})` };
  }
  const url = new URL(hosts().checkout);
  url.searchParams.set('key', key);
  url.searchParams.set('token', token);
  return { ok: true, checkoutUrl: url.toString() };
}

export type PaymentState = 'paid' | 'pending' | 'failed';
export interface VerifyResult {
  state: PaymentState;
  sid: string | null;
  amount: string | null;
  currency: string | null;
  paymentType: string | null;
  code: string | null;
  /** Transport problem (timeout, non-JSON) — the payment's real state is unknown. */
  unreachable?: boolean;
}

/** verify.php by `sid` (preferred) or by our `order_id`. */
export async function verify(by: { sid: string } | { order_id: string }): Promise<VerifyResult> {
  const r = await post(new URL('verify.php', hosts().gateway).toString(), by as Json, false);
  if (!r.ok) {
    // Unknown ≠ failed: never treat a timeout as a decline (Sifalo's guidance).
    return { state: 'pending', sid: null, amount: null, currency: null, paymentType: null, code: null, unreachable: true };
  }
  const d = r.data;
  const code = str(d.code);
  const status = str(d.status);
  const state: PaymentState =
    status === 'success' && code === '601' ? 'paid' : status === 'pending' || code === '603' ? 'pending' : 'failed';
  return { state, sid: str(d.sid), amount: str(d.amount), currency: str(d.currency), paymentType: str(d.payment_type), code };
}

export type RefundResult = { ok: true; refundSid: string | null } | { ok: false; error: string; code?: string | null };

/** Full refund of a successful payment (identified by its `sid`). */
export async function refund({ sid, gateway, amount, orderId }: { sid: string; gateway: string; amount: string; orderId: string }): Promise<RefundResult> {
  const r = await post(
    hosts().gateway,
    { payment_type: 'refund', sid, gateway, amount, currency: 'USD', order_id: orderId },
    true,
  );
  if (!r.ok) return r;
  const code = str(r.data.code);
  if (code === '601') return { ok: true, refundSid: str(r.data.sid) };
  return { ok: false, error: str(r.data.response) || 'Refund was not accepted', code };
}
