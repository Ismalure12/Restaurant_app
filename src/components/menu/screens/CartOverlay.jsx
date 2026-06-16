'use client';

import { useMenu } from '../MenuContext';
import ImgWithFallback from '@/components/ui/ImgWithFallback';
import { FMT } from '@/lib/menu/format';

// Basket sheet: line items with qty controls, totals, and proceed-to-checkout.
export default function CartOverlay() {
  const { cartOpen, tableFromQr, cart, cartCount, cartTotal, goBack, lineInc, lineDec, lineRemove, goCheckout } = useMenu();

  return (
    <div className={`page ${cartOpen ? 'open' : ''}`}>
      <div className="cart-head">
        <h3>Your <span>basket</span></h3>
        <button className="icon-btn" aria-label="Close basket" onClick={goBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="cart-meta">
        {tableFromQr ? (
          <span className="table-tag">● Table {tableFromQr}</span>
        ) : (
          <span className="table-tag table-tag-muted">Pick service at checkout</span>
        )}
        <span>{cartCount} item{cartCount === 1 ? '' : 's'}</span>
      </div>
      <div className="cart-list">
        {cart.length === 0 ? (
          <div className="cart-empty">
            <div className="ring">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h2l2.5 11.5a2 2 0 0 0 2 1.5h7a2 2 0 0 0 2-1.5L21 9H6" /><circle cx="10" cy="22" r="1" /><circle cx="18" cy="22" r="1" /></svg>
            </div>
            <h4>Your basket is empty</h4>
            <p>Tap any dish to add it. Build your order, then proceed to checkout.</p>
            <button className="browse" onClick={goBack}>Browse menu</button>
          </div>
        ) : (
          cart.map((c) => {
            const summary = [c.optionName, ...(c.extras || []).map((e) => e.name), c.notes].filter(Boolean).join(' · ');
            return (
              <div className="cart-item" key={c.uid}>
                {c.imageUrl ? <ImgWithFallback src={c.imageUrl} alt="" /> : <div className="ci-img-fallback" />}
                <div className="ci-body">
                  <h5 className="ci-name">{c.name}</h5>
                  <div className="ci-opts">{summary || ' '}</div>
                  <div className="ci-qty">
                    <button onClick={() => lineDec(c.uid)}>−</button>
                    <span className="val">{c.quantity}</span>
                    <button onClick={() => lineInc(c.uid)}>+</button>
                  </div>
                </div>
                <div className="ci-right">
                  <span className="ci-price">{FMT(c.unitPrice * c.quantity)}</span>
                  <button className="ci-rm" onClick={() => lineRemove(c.uid)}>Remove</button>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="cart-foot">
        <div className="cart-summary">
          <div className="summary-row"><span>Subtotal</span><span>{FMT(cartTotal)}</span></div>
          <div className="summary-row total"><span className="lbl">Total</span><span>{FMT(cartTotal)}</span></div>
        </div>
        <button className="show-waiter" onClick={goCheckout} disabled={!cart.length}>
          <span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            Proceed to checkout
          </span>
        </button>
      </div>
    </div>
  );
}
