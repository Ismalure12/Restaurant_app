'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';

export const TABLES_KEY = ['tables'];

// Same normalisation as the API (apps/api/src/lib/tables.ts tableKey): "T5",
// "Table 5" and "5" are one table. Only used to pre-select the right table.
export const tableKey = (s) => String(s || '').trim().toLowerCase().replace(/^(?:(?:table|tbl)[\s.#-]*|t(?=[\s.#-]*\d)[\s.#-]*)/, '').replace(/\s+/g, '');

/**
 * The restaurant's ACTIVE tables [{id,name}] (any Register role). One key, one
 * shape. An empty list means no tables are defined: the Register keeps its
 * free-text table input.
 */
export default function useTables() {
  const q = useQuery({ queryKey: TABLES_KEY, queryFn: () => fetchJson('/api/admin/tables'), staleTime: 60 * 1000 });
  const tables = Array.isArray(q.data) ? q.data : [];
  return { ...q, tables, hasTables: tables.length > 0 };
}
