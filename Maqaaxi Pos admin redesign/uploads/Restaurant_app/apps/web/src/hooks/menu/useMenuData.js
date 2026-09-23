'use client';

import { useEffect, useState } from 'react';

// The public menu (and, for a `?ref=` confirmation link, that order) loaded
// from the API. The web app has no database access — the menu comes from
// GET /api/menu, the order from GET /api/order?ref=.
//
// Returns { status: 'loading' | 'ready' | 'error', menu, order, retry }.
export default function useMenuData(ref) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading', menu: null, order: null });

  useEffect(() => {
    let cancelled = false;

    // One quiet retry: a 5xx right after the database wakes up is usually gone
    // a second later, so the customer shouldn't see the error screen for it.
    const fetchMenu = () => fetch('/api/menu').then((r) => {
      if (!r.ok) throw Object.assign(new Error(`menu ${r.status}`), { status: r.status });
      return r.json();
    });
    const loadMenu = fetchMenu().catch((err) => {
      if (err.status && err.status < 500) throw err;
      return new Promise((resolve) => setTimeout(resolve, 800)).then(fetchMenu);
    });
    // A bad or unknown ref must not break the menu — it just shows no confirmation.
    const loadOrder = ref
      ? fetch(`/api/order?ref=${encodeURIComponent(ref)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((o) => (o ? { ...o, total: o.total == null ? null : Number(o.total) } : null))
          .catch(() => null)
      : Promise.resolve(null);

    Promise.all([loadMenu, loadOrder])
      .then(([menu, order]) => {
        if (!cancelled) setState({ status: 'ready', menu, order });
      })
      .catch((err) => {
        console.error('Menu failed to load:', err);
        if (!cancelled) setState({ status: 'error', menu: null, order: null });
      });

    return () => { cancelled = true; };
  }, [ref, attempt]);

  const retry = () => {
    setState({ status: 'loading', menu: null, order: null });
    setAttempt((n) => n + 1);
  };

  return { ...state, retry };
}
