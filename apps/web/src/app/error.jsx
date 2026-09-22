'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="state-page">
      <div className="state-card">
        <span className="state-icon state-icon-neg" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
        </span>
        <h1 className="state-title">Something broke on our side</h1>
        {/* Says explicitly whether money moved — the first thing staff and
            customers need to know when a checkout screen fails. */}
        <p className="state-body">
          Nothing was charged and nothing was saved, so it&rsquo;s safe to try again.
        </p>
        {error?.digest && <p className="state-ref">ref {error.digest}</p>}
        <button type="button" onClick={reset} className="state-cta">Try again</button>
      </div>
    </div>
  );
}
