'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';

/** GET /api/admin/suppliers -> { suppliers: [{id,name,phone,isActive,owed}], totalOwed }. One key, one shape. */
export default function useSuppliers({ enabled = true } = {}) {
  const q = useQuery({ queryKey: ['suppliers'], queryFn: () => fetchJson('/api/admin/suppliers'), enabled, staleTime: 30 * 1000 });
  return { ...q, suppliers: q.data?.suppliers || [], totalOwed: Number(q.data?.totalOwed || 0) };
}
