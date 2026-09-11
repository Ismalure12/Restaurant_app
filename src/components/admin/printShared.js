'use client';

import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';

// Print documents render into document.body through a portal, so they need to
// know they're on the client (no `document` during SSR). useSyncExternalStore
// gives a hydration-safe answer without a setState-in-effect.
const subscribeNoop = () => () => {};
export function useIsClient() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

// Business identity for printed documents. Shares the ['settings'] cache with
// the Settings page, so a save there shows up on the next print immediately.
export function useBusiness() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => fetchJson('/api/admin/settings'),
    staleTime: 5 * 60 * 1000,
  });
  return {
    name: data?.businessName?.trim() || 'Maqaaxi Pos',
    phone: data?.businessPhone?.trim() || '',
    address: data?.businessAddress?.trim() || '',
    taxId: data?.taxId?.trim() || '',
    footer: data?.receiptFooter?.trim() || '',
    terms: data?.invoiceTerms?.trim() || '',
    // The restaurant's EVC Plus number customers send payment to.
    evcAccount: data?.evcAccount?.trim() || '',
  };
}

export const printMoney = (n) => {
  const v = Number(n || 0);
  const s = '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `-${s}` : s;
};
export const printDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
export const printTime = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
