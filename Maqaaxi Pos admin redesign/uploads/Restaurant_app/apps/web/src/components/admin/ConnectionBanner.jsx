'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConnection } from '@/lib/connection';
import { fetchJson } from '@/lib/apiError';

/**
 * A slim bar under the top of the screen while the device is offline or the
 * server can't be reached. When things recover it says so for a moment and
 * refreshes what is on screen. Not a toast: it stays for as long as the
 * problem does.
 */
export default function ConnectionBanner() {
  const status = useConnection();
  const qc = useQueryClient();
  const [showBack, setShowBack] = useState(false);
  const [probing, setProbing] = useState(false);
  const prev = useRef('ok');

  useEffect(() => {
    if (prev.current !== 'ok' && status === 'ok') {
      setShowBack(true);
      // Only what is on screen now; the rest refetches when it is next opened.
      qc.invalidateQueries({ refetchType: 'active' });
      const t = setTimeout(() => setShowBack(false), 2500);
      prev.current = status;
      return () => clearTimeout(t);
    }
    prev.current = status;
  }, [status, qc]);

  // Retry = actually ask the server. fetchJson flips the state back to 'ok'
  // only when an answer arrives; a failed probe leaves the banner up.
  const retry = async () => {
    if (probing) return;
    setProbing(true);
    try { await fetchJson('/api/auth/me', { timeoutMs: 10_000 }); } catch { /* still down — the banner stays and says so */ }
    finally { setProbing(false); }
  };

  if (status === 'ok' && !showBack) return null;

  const offline = status === 'offline';
  const text = status === 'ok' ? 'Back online — refreshing…'
    : offline ? 'No internet connection. Changes can’t be saved until you’re back online.'
    : 'Can’t reach the server. We’ll keep trying — your work on this screen is safe.';

  return (
    <div className={`conn-banner ${status === 'ok' ? 'is-ok' : offline ? 'is-offline' : 'is-server'}`} role="status" aria-live="polite">
      <span className="conn-dot" aria-hidden="true" />
      <span className="conn-text">{text}</span>
      {status === 'unreachable' && (
        <button type="button" className="conn-retry" onClick={retry} disabled={probing}>{probing ? 'Checking…' : 'Retry'}</button>
      )}
    </div>
  );
}
