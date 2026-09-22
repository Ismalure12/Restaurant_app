'use client';

import { useMenu } from '../MenuContext';
import { FMT } from '@/lib/menu/format';

// Floating basket button (bottom of the shell) showing item count + running total.
export default function CartFab() {
  const { fabRef, badgeRef, cartCount, cartTotal, openCart } = useMenu();
  return (
    <button ref={fabRef} className={`cart-fab ${cartCount > 0 ? 'visible' : ''}`} aria-label="Open basket" onClick={openCart}>
      <div className="icn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h2l2.5 11.5a2 2 0 0 0 2 1.5h7a2 2 0 0 0 2-1.5L21 9H6" />
          <circle cx="10" cy="22" r="1" /><circle cx="18" cy="22" r="1" />
        </svg>
        <span ref={badgeRef} className="badge">{cartCount}</span>
      </div>
      <span>Your basket</span>
      <span className="total"><span>{FMT(cartTotal)}</span><span className="arr">→</span></span>
    </button>
  );
}
