'use client';

import { useEffect } from 'react';
import { useMenu } from '../MenuContext';
import Crest from '../components/Crest';
import ImgWithFallback from '@/components/ui/ImgWithFallback';
import { FMT, CARRIERS } from '@/lib/menu/format';

// Checkout overlay: order review + dine-in/delivery form + payment number.
export default function CheckoutScreen() {
  const {
    checkoutOpen: open,
    coOrderType: orderType, setCoOrderType: setOrderType,
    coCarrier: carrier, setCoCarrier: setCarrier,
    coCarrierOpen: carrierOpen, setCoCarrierOpen: setCarrierOpen,
    coPhoneFocus: phoneFocus, setCoPhoneFocus: setPhoneFocus,
    coName: name, setCoName: setName,
    coPhone: phone, setCoPhone: setPhone,
    coTable: table, setCoTable: setTable,
    coAddress: address, setCoAddress: setAddress,
    coError: error, coSubmitting: submitting,
    cart, submitCheckout: onSubmit, goBack: onBack,
  } = useMenu();

  const total = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  const selCarrier = CARRIERS.find((c) => c.prefix === carrier) || CARRIERS[0];
  const itemCount = cart.length;

  // Close carrier menu on outside click
  useEffect(() => {
    if (!carrierOpen) return;
    const onClick = (e) => {
      if (!e.target.closest?.('.carrier')) setCarrierOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [carrierOpen, setCarrierOpen]);

  return (
    <div className={`page checkout-page ${orderType === 'dine_in' ? 'dine' : 'delivery'} ${open ? 'open' : ''}`}>
      <div className="co-scroll">
        <div className="topbar solid co-topbar">
          <Crest />
          <button type="button" className="co-back" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
            </svg>
            Back to basket
          </button>
        </div>

        <div className="co-content">
          <h1 className="co-title">Almost <em>there.</em></h1>
          <p className="co-sub">
            {orderType === 'dine_in'
              ? 'Review your basket and confirm your table.'
              : 'Review your basket and tell us where to send it.'}
          </p>

          <div className="co-cols">
            <div className="co-left">
              <div className="co-card">
                <div className="co-eyebrow">Your basket</div>
                <h2 className="co-h2">{itemCount} item{itemCount === 1 ? '' : 's'}</h2>
                <div>
                  {cart.map((c) => {
                    const sub = [c.optionName, ...(c.extras || []).map((e) => e.name), c.notes].filter(Boolean).join(' · ');
                    return (
                      <div className="co-item" key={c.uid}>
                        <ImgWithFallback src={c.imageUrl} alt="" />
                        <div className="ci-body">
                          <p className="ci-name">
                            {c.name}
                            {c.quantity > 1 && <span className="ci-qty-mark"> × {c.quantity}</span>}
                          </p>
                          {sub && <div className="ci-sub">{sub}</div>}
                        </div>
                        <span className="ci-price">{FMT(c.unitPrice * c.quantity)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="co-total-row">
                  <span className="lbl">Total</span>
                  <span className="amt">{FMT(total)}</span>
                </div>
              </div>
            </div>

            <div className="co-right">
              <div className="co-card">
                <div className="co-eyebrow">{orderType === 'dine_in' ? 'Dine-in' : 'Delivery'}</div>
                <h2 className="co-h2" dangerouslySetInnerHTML={{ __html:
                  orderType === 'dine_in'
                    ? 'Where are you <em style="color:var(--green)">sitting?</em>'
                    : 'Where should we <em style="color:var(--blue)">send it?</em>'
                }} />

                <div className="ordertype">
                  <button type="button" className={`ot ${orderType === 'dine_in' ? 'active' : ''}`} onClick={() => setOrderType('dine_in')}>
                    Dine-in<span>I&apos;m at a table</span>
                  </button>
                  <button type="button" className={`ot ${orderType === 'delivery' ? 'active' : ''}`} onClick={() => setOrderType('delivery')}>
                    Delivery<span>Bring it to me</span>
                  </button>
                </div>

                <form onSubmit={onSubmit} noValidate>
                  <div className="co-field">
                    <label className="co-label" htmlFor="co-name">Full name</label>
                    <input id="co-name" className="co-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" autoComplete="name" />
                  </div>

                  <div className="co-field">
                    <label className="co-label">Phone</label>
                    <div className={`phone-row ${phoneFocus ? 'focus' : ''}`}>
                      <div className={`carrier ${carrierOpen ? 'open' : ''}`}>
                        <button className="carrier-btn" type="button" onClick={(e) => { e.stopPropagation(); setCarrierOpen((v) => !v); }}>
                          <span className="carrier-dot" style={{ background: selCarrier.color }} />
                          <span className="carrier-name">{selCarrier.name}</span>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
                        </button>
                        {carrierOpen && (
                          <div className="carrier-menu">
                            {CARRIERS.map((c) => (
                              <button key={c.prefix} type="button" className={`carrier-opt ${c.prefix === carrier ? 'sel' : ''}`} onClick={() => { setCarrier(c.prefix); setCarrierOpen(false); }}>
                                <span className="carrier-dot" style={{ background: c.color }} />
                                <span className="carrier-name">{c.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        onFocus={() => setPhoneFocus(true)}
                        onBlur={() => setPhoneFocus(false)}
                        placeholder="7454776"
                        inputMode="numeric"
                        autoComplete="tel"
                      />
                    </div>
                    <p className="co-hint">Your Waafi / EVC number — we&apos;ll send a payment prompt here.</p>
                  </div>

                  {orderType === 'dine_in' ? (
                    <div className="co-field">
                      <label className="co-label" htmlFor="co-table">Table number</label>
                      <input id="co-table" className="co-input" type="text" value={table} onChange={(e) => setTable(e.target.value)} inputMode="numeric" placeholder="e.g. 14" />
                      <p className="co-hint">We&apos;ll bring the order to this table.</p>
                    </div>
                  ) : (
                    <div className="co-field">
                      <label className="co-label" htmlFor="co-addr">Delivery address</label>
                      <input id="co-addr" className="co-input" type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Garden Crescent, building 14" />
                    </div>
                  )}

                  {error && <p className="co-error">{error}</p>}

                  <button className="place-order" type="submit" disabled={submitting || cart.length === 0}>
                    {submitting ? 'Processing…' : `Place order  ·  ${FMT(total)}`}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
