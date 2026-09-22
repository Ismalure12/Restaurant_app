'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';

export const STAFF_LIST_KEY = ['staff-list'];

/**
 * Every login (GET /api/users, manager tier), always as an array.
 * One key, one shape: every page that needs the staff list goes through this
 * hook, so a page can't cache a different shape under the same key and crash
 * another page that reads it.
 */
export default function useStaffList({ enabled = true } = {}) {
  const q = useQuery({ queryKey: STAFF_LIST_KEY, queryFn: () => fetchJson('/api/users'), staleTime: 60 * 1000, enabled, retry: (n, err) => err?.status !== 403 && n < 2 });
  return {
    ...q,
    staff: Array.isArray(q.data) ? q.data : [],
    denied: q.error?.status === 403,
  };
}
