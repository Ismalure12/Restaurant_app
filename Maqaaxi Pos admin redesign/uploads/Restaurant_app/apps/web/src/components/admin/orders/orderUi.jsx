import { money } from '@/lib/money';
// Labels, pills and small helpers shared by the Orders list, the order detail
// view (Orders and Sales report) and the order modals — one vocabulary.

export { money };
export const cap = (t) => ({ dine_in: 'Dine-in', delivery: 'Delivery' }[t] || t);
export const initials = (s) => (s || '').replace(/[^a-zA-Z0-9 ]/g, '').split(' ').map((x) => x[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '#';
export const dt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export function ago(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const MANAGER_ROLES = ['admin', 'manager'];
export const METHOD_LABEL = {
  cash: 'Cash', card: 'Card', evc: 'EVC', invoice: 'On account',
  waafi: 'EVC/ZAAD', edahab: 'eDahab', pbwallet: 'Premier Wallet', sifalo: 'Sifalo Pay',
};

// Order status. 'open' is the internal name of a pay-later order — staff see "Unpaid".
export const STATUS = {
  pending: { label: 'Awaiting', cls: 'pill-amber', color: 'var(--amber)' },
  open: { label: 'In kitchen', cls: 'pill-sky', color: 'var(--sky)' },
  confirmed: { label: 'Completed', cls: 'pill-green', color: 'var(--primary)' },
  declined: { label: 'Declined', cls: 'pill-rose', color: 'var(--rose)' },
  voided: { label: 'Voided', cls: 'pill-ghost', color: 'var(--faint)' },
};

/** Money state of an order, as one pill: Paid · Unpaid · On account · Refunded. */
export function payPill(o) {
  if (o.paymentStatus === 'refunded') return { cls: 'pill-rose', label: 'Refunded' };
  if (o.paymentStatus === 'paid') return { cls: 'pill-green', label: 'Paid' };
  if (o.paymentMethod === 'invoice') return { cls: 'pill-gold', label: 'On account' };
  return { cls: 'pill-amber', label: 'Unpaid' };
}
/** Unpaid at the counter (pay-later, not billed to an account) — can take payment. */
export const isPayLater = (o) => o.status === 'open';
/** Anything not yet settled in cash: pay-later + On account. */
export const isUnpaid = (o) => o.paymentStatus === 'unpaid' && o.status !== 'voided' && o.status !== 'declined';

export const whoOf = (o) => o.contactName || o.customer?.name || (o.orderType === 'delivery' ? 'Delivery' : (o.tableNumber ? `Table ${o.tableNumber}` : 'Walk-in'));

export const Ic = {
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5" /></svg>,
  x: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  pen: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
  print: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>,
  back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg>,
  cash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 10v4M18 10v4" /></svg>,
};

// Mirrors the PATCH / void routes' refusals so buttons explain themselves
// instead of failing on click. The server remains the authority.
export function editBlocker(o) {
  if (o.status === 'pending') return 'Accept or decline this order before editing it.';
  if (o.status !== 'confirmed' && o.status !== 'open') return `A ${o.status} order can’t be edited.`;
  if (o.paymentStatus === 'refunded') return 'A refunded order can’t be edited.';
  if (o.paymentTransactionId && o.paymentStatus === 'paid') return 'Paid online — the captured amount can’t be adjusted. Void the order instead of editing it.';
  if (o.invoice?.status === 'void') return 'This order’s invoice is void.';
  return null;
}
