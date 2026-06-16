'use client';

import { useEffect, useState } from 'react';

// Cart state + line operations, persisted to localStorage. Falls back to the
// legacy `rh_cart` key once so an in-progress cart survives the rename.
export default function useCart() {
  const [cart, setCart] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('menu_cart') ?? localStorage.getItem('rh_cart');
      if (raw) setCart(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem('menu_cart', JSON.stringify(cart)); } catch {}
  }, [cart]);

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const cartTotal = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);

  const lineInc = (uid) => setCart((c) => c.map((x) => x.uid === uid ? { ...x, quantity: Math.min(x.quantity + 1, 20) } : x));
  const lineDec = (uid) => setCart((c) => {
    const x = c.find((l) => l.uid === uid);
    if (!x) return c;
    if (x.quantity <= 1) return c.filter((l) => l.uid !== uid);
    return c.map((l) => l.uid === uid ? { ...l, quantity: l.quantity - 1 } : l);
  });
  const lineRemove = (uid) => setCart((c) => c.filter((l) => l.uid !== uid));

  return { cart, setCart, cartCount, cartTotal, lineInc, lineDec, lineRemove };
}
