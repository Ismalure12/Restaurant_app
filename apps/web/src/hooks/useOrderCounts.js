'use client';

import { useQuery } from '@tanstack/react-query';

export const ORDER_COUNTS_KEY = ['order-counts'];

/**
 * Badge numbers (GET /api/admin/orders/counts, back-office roles):
 * { pending, unpaid, stuckPayments }, zeros while loading or refused.
 * One key, one shape — the sidebar and the Orders tabs both read it through
 * here. Live updates (useLiveOrders) refresh it the moment orders change; the
 * slow poll is only the fallback.
 */
export default function useOrderCounts({ enabled = true } = {}) {
  const { data } = useQuery({
    queryKey: ORDER_COUNTS_KEY,
    queryFn: () => fetch('/api/admin/orders/counts').then((r) => (r.ok ? r.json() : null)),
    enabled,
    refetchInterval: 60_000,
  });
  return {
    pending: data?.pending ?? 0,
    unpaid: data?.unpaid ?? 0,
    stuckPayments: data?.stuckPayments ?? 0,
  };
}
