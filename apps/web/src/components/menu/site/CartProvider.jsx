'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Cart state, shared across every public route.
//
// With real routes the cart outlives the page, so it lives here rather than
// inside a screen controller. Persistence is unchanged: `menu_cart` is the
// source of truth and the legacy `kfg_cart` key is still mirrored for the
// checkout page, exactly as before.

const CartContext = createContext(null);

const LINES_KEY = 'menu_cart';
const LEGACY_KEY = 'kfg_cart';
const MAX_QTY = 20;

function readSaved() {
  try {
    const raw = localStorage.getItem(LINES_KEY) ?? localStorage.getItem('rh_cart');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  // Server-rendered now, so the first client render MUST match the server's
  // empty cart; the saved cart is adopted after mount. `hydrated` lets the
  // chrome hold back counts until then instead of flashing a wrong number.
  // Both live in one object so hydration is a single state write.
  const [{ lines, hydrated }, setState] = useState({ lines: [], hydrated: false });
  const setLines = (update) => setState((s) => ({
    lines: typeof update === 'function' ? update(s.lines) : update,
    hydrated: s.hydrated,
  }));

  useEffect(() => {
    // One-time adoption of the persisted cart on mount. It cannot be read
    // during render (no localStorage on the server, so the markup would not
    // match) and it is mutable state afterwards, so useSyncExternalStore does
    // not fit either.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ lines: readSaved(), hydrated: true });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const json = JSON.stringify(lines);
      localStorage.setItem(LINES_KEY, json);
      localStorage.setItem(LEGACY_KEY, json);
    } catch { /* private mode — the cart just won't survive a reload */ }
  }, [lines, hydrated]);

  const value = useMemo(() => {
    const count = lines.reduce((s, l) => s + l.quantity, 0);
    const total = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    return {
      lines,
      hydrated,
      count,
      total,
      add: (line) => setLines((c) => [...c, line]),
      inc: (uid) => setLines((c) => c.map((l) => (
        l.uid === uid ? { ...l, quantity: Math.min(l.quantity + 1, MAX_QTY) } : l
      ))),
      dec: (uid) => setLines((c) => {
        const found = c.find((l) => l.uid === uid);
        if (!found) return c;
        if (found.quantity <= 1) return c.filter((l) => l.uid !== uid);
        return c.map((l) => (l.uid === uid ? { ...l, quantity: l.quantity - 1 } : l));
      }),
      remove: (uid) => setLines((c) => c.filter((l) => l.uid !== uid)),
      clear: () => setLines([]),
    };
  }, [lines, hydrated]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
