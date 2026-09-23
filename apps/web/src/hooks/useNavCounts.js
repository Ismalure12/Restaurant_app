'use client';

import { useQuery } from '@tanstack/react-query';

export const NAV_COUNTS_KEY = ['nav-counts'];

/**
 * Sidebar badges + the topbar bell (GET /api/admin/nav-counts). The API only
 * returns the groups this role may view: { pending, stuckPayments, openTabs,
 * lowStock, outOfStock, unclosedDays, oldestUnclosed } — missing = not
 * allowed (treated as 0). Refreshed by useLiveOrders on every order change;
 * the slow poll is the fallback.
 */
export default function useNavCounts({ enabled = true } = {}) {
  const { data } = useQuery({
    queryKey: NAV_COUNTS_KEY,
    queryFn: () => fetch('/api/admin/nav-counts').then((r) => (r.ok ? r.json() : null)),
    enabled,
    refetchInterval: 60_000,
  });
  const d = data || {};
  return {
    pending: d.pending ?? 0,
    stuckPayments: d.stuckPayments ?? 0,
    openTabs: d.openTabs ?? 0,
    lowStock: d.lowStock ?? 0,
    outOfStock: d.outOfStock ?? 0,
    unclosedDays: d.unclosedDays ?? 0,
    oldestUnclosed: d.oldestUnclosed ?? null,
  };
}
