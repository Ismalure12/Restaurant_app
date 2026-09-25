'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';

export const MONEY_ACCOUNTS_KEY = ['money-accounts'];

/**
 * The ACTIVE business money accounts (GET /api/admin/accounts) — Cash, the
 * wallets A/C · E/d · My Cash…, the Mastercard, the bank, Sifalo — always as
 * an array of { id, kind, label, number, staffNumbers }. One key, one shape: balances live
 * under a different key (['account-balances']).
 */
export default function useMoneyAccounts({ enabled = true } = {}) {
  const q = useQuery({ queryKey: MONEY_ACCOUNTS_KEY, queryFn: () => fetchJson('/api/admin/accounts'), staleTime: 60 * 1000, enabled });
  return { ...q, accounts: Array.isArray(q.data) ? q.data : [] };
}

/** Accounts money can be paid OUT of (not the online gateway). */
export const payableAccounts = (accounts) => accounts.filter((a) => a.kind !== 'gateway');
export const accountName = (a) => (a.kind === 'cash' ? 'Cash' : a.label);
