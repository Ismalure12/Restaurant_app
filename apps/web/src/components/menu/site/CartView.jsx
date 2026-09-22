'use client';

import Link from 'next/link';
import { useCart } from './CartProvider';
import useMounted from '@/hooks/useMounted';
import ImgWithFallback from '@/components/ui/ImgWithFallback';
import { FMT } from '@/lib/menu/format';

export default function CartView() {
  const { lines, total, count, inc, dec, remove } = useCart();
  const mounted = useMounted();

  // Before this component mounts the cart is unknown, not empty — showing the
  // empty state here would flash "nothing in your order" over a full basket.
  if (!mounted) {
    return (
      <section className="mx-section" aria-busy="true">
        <h1 className="mx-h1">Your order</h1>
        <div className="mx-skel-list">
          <span className="mx-skel-row" /><span className="mx-skel-row" />
        </div>
      </section>
    );
  }

  if (lines.length === 0) {
    return (
      <section className="mx-section mx-empty">
        <span className="mx-empty-ring" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" />
            <path d="M2 3h3l2.4 11.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6" />
          </svg>
        </span>
        <h1 className="mx-empty-title">Nothing in your order yet</h1>
        <p className="mx-empty-sub">Browse the menu and add a dish to get started.</p>
        <Link href="/" className="mx-btn mx-btn-primary">Browse the menu</Link>
      </section>
    );
  }

  return (
    <section className="mx-section mx-cart">
      <div className="mx-section-head">
        <h1 className="mx-h1">Your order</h1>
        <span className="mx-meta">{count} {count === 1 ? 'item' : 'items'}</span>
      </div>

      <ul className="mx-cart-lines">
        {lines.map((l) => (
          <li key={l.uid} className="mx-cart-line">
            <span className="mx-cart-media">
              <ImgWithFallback src={l.imageUrl} alt="" />
            </span>
            <div className="mx-cart-body">
              <span className="mx-cart-name">{l.name}</span>
              {l.optionName && <span className="mx-meta">{l.optionName}</span>}
              {l.extras?.length > 0 && (
                <span className="mx-meta">{l.extras.map((e) => e.name).join(', ')}</span>
              )}
              {l.notes && <span className="mx-cart-note">&ldquo;{l.notes}&rdquo;</span>}
              <span className="mx-price tnum">{FMT(l.unitPrice * l.quantity)}</span>
            </div>
            <div className="mx-cart-controls">
              <div className="mx-stepper mx-stepper-sm">
                <button type="button" onClick={() => dec(l.uid)} aria-label={`Decrease ${l.name}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14" /></svg>
                </button>
                <span className="tnum">{l.quantity}</span>
                <button type="button" onClick={() => inc(l.uid)} aria-label={`Increase ${l.name}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>
              <button type="button" className="mx-link-btn" onClick={() => remove(l.uid)}>Remove</button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mx-cart-summary">
        <div className="mx-total-row">
          <span className="mx-total-label">Total</span>
          <span className="mx-total-value tnum">{FMT(total)}</span>
        </div>
        <Link href="/checkout" className="mx-btn mx-btn-primary mx-btn-block">Proceed to checkout</Link>
        <p className="mx-fineprint">You&rsquo;ll pay securely with EVC / Sifalo Pay.</p>
      </div>
    </section>
  );
}
