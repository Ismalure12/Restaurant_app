'use client';

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';

// Where the customer is sitting, captured from the QR code's ?table= and kept
// for the rest of the visit. The printed codes point at / with ?table=, and
// that still works: this reads the param on whichever route they land on.
//
// The saved value is read through useSyncExternalStore rather than copied into
// state in an effect, so there is no cascading render and the server snapshot
// ('' — no localStorage there) matches the first client render.

const OrderCtx = createContext({ tableNumber: '' });
const KEY = 'menu_order_ctx';

const subscribe = (cb) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};
const getSnapshot = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}').tableNumber || '';
  } catch {
    return '';
  }
};
const getServerSnapshot = () => '';

export function OrderContextProvider({ children }) {
  const fromUrl = (useSearchParams()?.get('table') || '').trim();
  const saved = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Write-only: remember the table this QR code named for the rest of the visit.
  useEffect(() => {
    if (!fromUrl) return;
    try { localStorage.setItem(KEY, JSON.stringify({ tableNumber: fromUrl })); } catch {}
  }, [fromUrl]);

  return (
    <OrderCtx.Provider value={{ tableNumber: fromUrl || saved }}>
      {children}
    </OrderCtx.Provider>
  );
}

export const useOrderContext = () => useContext(OrderCtx);
