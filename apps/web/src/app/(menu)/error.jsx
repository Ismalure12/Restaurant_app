'use client';

import { useEffect } from 'react';

// The menu itself failed to load — almost always the API being unreachable.
export default function MenuError({ error, reset }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <section className="mx-section mx-empty">
      <span className="mx-empty-ring mx-empty-ring-neg" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
      </span>
      <h1 className="mx-empty-title">We couldn&rsquo;t load the menu</h1>
      <p className="mx-empty-sub">
        This is usually a connection problem. Nothing in your order was lost.
      </p>
      <button type="button" className="mx-btn mx-btn-primary" onClick={reset}>Try again</button>
    </section>
  );
}
