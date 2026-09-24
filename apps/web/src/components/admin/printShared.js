'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { RECEIPT_CSS } from './receiptCss';

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
    // Money accounts customers pay into, e.g. [{label:'EVC', number:'521436'}].
    // The API already falls back to the legacy single EVC number.
    accounts: Array.isArray(data?.paymentAccounts) ? data.paymentAccounts : [],
    // Tax % already included in prices — receipts show the included share only.
    taxRate: Number(data?.taxRate) > 0 ? Number(data.taxRate) : 0,
  };
}

/** Tax already inside a tax-inclusive total: total − total / (1 + rate). */
export const includedTax = (total, ratePct) =>
  ratePct > 0 ? Math.round((total - total / (1 + ratePct / 100)) * 100) / 100 : 0;

/**
 * Print a finished document (HTML + CSS) from a hidden iframe instead of the
 * whole page. The browser's print preview then holds only the 80mm receipt:
 * no page layout to redo, no menu photos to fetch first, no app fonts — which
 * is what made printing from the Register slow.
 * Resolves once that print dialog has closed (printed or cancelled), so a
 * caller can open the next paper's dialog after it.
 */
export function printHtml(html, css) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    // <base> so the receipt font's root-relative URL resolves inside the blank frame.
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Print</title><base href="${window.location.origin}/"><style>
      @page { size: 80mm auto; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; }
      ${css}
    </style></head><body>${html}</body></html>`);
    doc.close();
    const win = frame.contentWindow;
    // Remove the frame once the dialog closes (afterprint), with a fallback.
    let settled = false;
    const finish = () => { if (settled) return; settled = true; setTimeout(() => frame.remove(), 500); resolve(); };
    win.addEventListener('afterprint', finish, { once: true });
    // Safety net only: a browser that never fires afterprint must not hold the
    // next paper forever (nor keep the frame).
    setTimeout(finish, 5 * 60_000);
    // Wait for the receipt font (cached after the first print) so the first
    // receipt isn't printed in the fallback face; never wait more than 1.5 s.
    let printed = false;
    const go = () => { if (printed || !frame.isConnected) return; printed = true; win.focus(); win.print(); };
    const fonts = doc.fonts;
    if (fonts?.load) {
      Promise.race([fonts.load('12px "Receipt Mono"'), new Promise((r) => setTimeout(r, 1500))]).then(go, go);
    } else {
      go();
    }
  });
}

/**
 * Which print document is mounted ('customer' receipt, 'bill', 'kitchen'
 * ticket, 'invoice') and a print(kind) that swaps to it synchronously, then
 * prints the rendered markup through printHtml.
 * print(['customer', 'kitchen']) prepares BOTH papers at once, then prints
 * them as separate jobs, one after the other: the first paper's dialog opens,
 * and when it closes (printed or cancelled) the second one's opens by itself.
 * The cashier prints both, or cancels the second to keep just the first.
 * Never one job with both pages — that forced both papers out together.
 */
export function usePrintDoc(initial = 'customer') {
  const [kind, setKind] = useState(initial);
  const print = useCallback((next) => {
    const kinds = Array.isArray(next) ? next : [next];
    const pages = [];
    for (const k of kinds) {
      flushSync(() => setKind(k));
      const node = document.querySelector('[data-print-doc]');
      if (node) pages.push(node.innerHTML);
    }
    if (!pages.length) return;
    // One after another, each only once the previous dialog has closed.
    pages.reduce((prev, html) => prev.then(() => printHtml(html, RECEIPT_CSS)), Promise.resolve());
  }, []);
  return [kind, print];
}

export const printMoney = (n) => {
  const v = Number(n || 0);
  const s = '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `-${s}` : s;
};
export const printDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
export const printTime = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
