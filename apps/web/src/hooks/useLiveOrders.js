'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ORDER_COUNTS_KEY } from './useOrderCounts';

// Every screen that shows live order state. Refetched (only if mounted) the
// moment the API says orders changed.
const LIVE_KEYS = [['orders-all'], ORDER_COUNTS_KEY, ['tables-status'], ['online-payments']];

/**
 * Server-Sent Events from GET /api/admin/events: a data-less "orders changed"
 * nudge → refetch now instead of waiting for the next poll. Mounted once in
 * the dashboard layout for back-office roles. The browser reconnects on its
 * own; if the stream can't be used at all, the pages keep their slow polling,
 * so nothing is ever missed — only delayed.
 */
export default function useLiveOrders(enabled) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return undefined;
    const es = new EventSource('/api/admin/events');
    const refresh = () => {
      for (const queryKey of LIVE_KEYS) qc.invalidateQueries({ queryKey, refetchType: 'active' });
    };
    es.addEventListener('orders', refresh);
    // After a dropped connection comes back, catch up on anything missed.
    let opened = false;
    es.onopen = () => { if (opened) refresh(); opened = true; };
    return () => es.close();
  }, [enabled, qc]);
}
