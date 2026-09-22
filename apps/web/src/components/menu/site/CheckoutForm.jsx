'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from './CartProvider';
import { useOrderContext } from './OrderContext';
import useMounted from '@/hooks/useMounted';
import { CARRIERS, FMT } from '@/lib/menu/format';

const DETAILS_KEY = 'menu_checkout_details';

// Checkout. The payment path is unchanged from the single-page version:
// POST /api/checkout (the server reprices the cart) → POST /api/payment/initiate
// → hand the browser to Sifalo's hosted checkout. Sifalo returns the customer
// to /api/payment/return, which verifies server-side and lands them on
// /order/<ref>. Nothing here is trusted for pricing.
export default function CheckoutForm() {
  const router = useRouter();
  const { lines, total } = useCart();
  const mounted = useMounted();
  const { tableNumber } = useOrderContext();

  // One object, so restoring the saved details is a single state write.
  const [form, setForm] = useState({
    orderType: 'dine_in', name: '', carrier: '90', phone: '', address: '',
  });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const { orderType, name, carrier, phone, address } = form;

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // The table comes from the QR code unless the customer types over it, so it
  // is derived rather than copied into state by an effect.
  const [tableEdit, setTableEdit] = useState(null);
  const table = tableEdit ?? tableNumber ?? '';

  // Prefill from the last checkout on this phone. Never leaves the device.
  useEffect(() => {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(DETAILS_KEY) || '{}');
    } catch {
      return; // private mode — no prefill
    }
    const patch = {};
    if (saved.name) patch.name = saved.name;
    if (saved.address) patch.address = saved.address;
    if (saved.phone) {
      const digits = String(saved.phone).replace(/\D/g, '');
      const c = CARRIERS.find((x) => digits.startsWith(x.prefix));
      if (c) { patch.carrier = c.prefix; patch.phone = digits.slice(c.prefix.length); }
      else patch.phone = digits;
    }
    if (!Object.keys(patch).length) return;
    // Restoring persisted details on mount; localStorage cannot be read during
    // render without the server and client markup disagreeing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Please enter your name.');
    if (!phone.trim()) return setError('Please enter your phone number.');
    if (orderType === 'dine_in' && !table.trim()) return setError('Please enter your table number.');
    if (orderType === 'delivery' && !address.trim()) return setError('Please enter your delivery address.');

    const digits = phone.replace(/\D/g, '');
    const fullPhone = `252${carrier}${digits}`;

    try {
      localStorage.setItem(DETAILS_KEY, JSON.stringify({
        name: name.trim(),
        phone: carrier + digits,
        address: orderType === 'delivery' ? address.trim() : undefined,
      }));
    } catch { /* storage blocked — prefill just won't happen next time */ }

    setSubmitting(true);
    try {
      const checkoutRes = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: fullPhone,
          orderType,
          address: orderType === 'delivery' ? address.trim() : undefined,
          tableNumber: orderType === 'dine_in' ? table.trim() : undefined,
          cart: lines,
          total,
        }),
      });
      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok || !checkoutData.reference) {
        throw new Error(checkoutData.error || 'Could not start checkout.');
      }

      const payRes = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: checkoutData.reference }),
      });
      const payData = await payRes.json().catch(() => ({}));

      // Already paid for this reference — go straight to the confirmation.
      if (payRes.status === 409 && payData.reference) {
        router.push(`/order/${encodeURIComponent(payData.reference)}`);
        return;
      }
      if (!payRes.ok || !payData.checkoutUrl) {
        throw new Error('Payment could not be started. Please try again.');
      }
      window.location.assign(payData.checkoutUrl);
      // Deliberately stay in the submitting state while the browser leaves.
    } catch (err) {
      setSubmitting(false);
      setError(err.message || 'Something went wrong.');
    }
  };

  if (mounted && lines.length === 0) {
    return (
      <section className="mx-section mx-empty">
        <h1 className="mx-empty-title">Your order is empty</h1>
        <p className="mx-empty-sub">Add a dish before checking out.</p>
        <Link href="/" className="mx-btn mx-btn-primary">Browse the menu</Link>
      </section>
    );
  }

  return (
    <section className="mx-section mx-checkout">
      <h1 className="mx-h1">Checkout</h1>

      <form className="mx-form" onSubmit={submit}>
        <fieldset className="mx-field-group">
          <legend className="mx-legend">Order type</legend>
          <div className="mx-segmented" role="group">
            <button
              type="button"
              className={orderType === 'dine_in' ? 'is-on' : ''}
              onClick={() => set({ orderType: 'dine_in' })}
              aria-pressed={orderType === 'dine_in'}
            >
              Dine-in
            </button>
            <button
              type="button"
              className={orderType === 'delivery' ? 'is-on' : ''}
              onClick={() => set({ orderType: 'delivery' })}
              aria-pressed={orderType === 'delivery'}
            >
              Delivery
            </button>
          </div>
        </fieldset>

        <div className="mx-field">
          <label htmlFor="co-name">Your name</label>
          <input id="co-name" className="mx-input" value={name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" required />
        </div>

        <div className="mx-field">
          <label htmlFor="co-phone">Payment number</label>
          <div className="mx-phone">
            <label htmlFor="co-carrier" className="mx-sr-only">Carrier</label>
            <select id="co-carrier" className="mx-select" value={carrier} onChange={(e) => set({ carrier: e.target.value })}>
              {CARRIERS.map((c) => (
                <option key={c.prefix} value={c.prefix}>{c.name} · {c.prefix}</option>
              ))}
            </select>
            <input
              id="co-phone"
              className="mx-input"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="1234567"
              value={phone}
              onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '').slice(0, 9) })}
              required
            />
          </div>
          <span className="mx-hint">We&rsquo;ll send the payment request to +252 {carrier} {phone || '—'}</span>
        </div>

        {orderType === 'dine_in' ? (
          <div className="mx-field">
            <label htmlFor="co-table">Table number</label>
            <input id="co-table" className="mx-input" value={table} onChange={(e) => setTableEdit(e.target.value)} required />
          </div>
        ) : (
          <div className="mx-field">
            <label htmlFor="co-address">Delivery address</label>
            <input id="co-address" className="mx-input" value={address} onChange={(e) => set({ address: e.target.value })} autoComplete="street-address" required />
          </div>
        )}

        {error && <p className="mx-error" role="alert">{error}</p>}

        <div className="mx-cart-summary">
          <div className="mx-total-row">
            <span className="mx-total-label">Total</span>
            {/* The total comes from the cart, which is client-only — the server
                has no basket to render. Held until this component mounts so the
                server HTML and the first client render agree. */}
            <span className="mx-total-value tnum">{mounted ? FMT(total) : '—'}</span>
          </div>
          <button
            type="submit"
            className="mx-btn mx-btn-primary mx-btn-block"
            disabled={submitting || !mounted}
          >
            {submitting ? 'Opening secure payment…' : 'Pay now'}
          </button>
          <p className="mx-fineprint">
            You&rsquo;ll be taken to Sifalo Pay to approve the payment on your phone.
          </p>
        </div>
      </form>
    </section>
  );
}
