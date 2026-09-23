'use client';

import { useSyncExternalStore } from 'react';

/**
 * One shared "can we reach the server?" state, fed by fetchJson and by the
 * browser's online/offline events, so a single banner can say so instead of
 * every failing request showing its own error.
 *   'ok' | 'offline' | 'unreachable'
 */
let state = 'ok';
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export function setConnection(next) {
  if (next === state) return;
  state = next;
  emit();
}

const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };

export const useConnection = () => useSyncExternalStore(subscribe, () => state, () => 'ok');

if (typeof window !== 'undefined') {
  if (navigator.onLine === false) state = 'offline';
  window.addEventListener('offline', () => setConnection('offline'));
  // Coming back online clears "offline"; a still-broken server re-flags itself on the next request.
  window.addEventListener('online', () => setConnection('ok'));
}
