'use client';

import { useEffect, useState } from 'react';

// Cart state + line operations, persisted to localStorage. Falls back to the
// legacy `rh_cart` key once so an in-progress cart survives the rename.
//
// The saved cart is read once, when the state is created. The menu mounts only
// in the browser, after /api/menu has loaded — never server-rendered — so
// reading localStorage here can't cause a hydration mismatch. (Reading it in a
// mount effect instead raced the save effect below: under React's dev
// double-mount the save wrote [] first and the basket was lost on reload.)
function readSavedCart() {
  try {
    const raw = localStorage.getItem('menu_cart') ?? localStorage.getItem('rh_cart');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function useCart() {
  const [cart, setCart] = useState(readSavedCart);

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
