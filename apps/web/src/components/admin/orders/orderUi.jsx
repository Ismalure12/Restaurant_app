import { money } from '@/lib/money';
import Icon from '@/components/admin/ui/icons';
// Labels, status tones and small helpers shared by the Orders list, the order
// detail view (Orders, Sales history, the sale drawer) and the order modals —
// one vocabulary (docs/admin-design-system.md §5). `tone` is a ui/Chip tone.

export { money };
export const cap = (t) => ({ dine_in: 'Dine-in', delivery: 'Delivery' }[t] || t);
export const initials = (s) => (s || '').replace(/[^a-zA-Z0-9 ]/g, '').split(' ').map((x) => x[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '#';
export const dt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const hm = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
export function ago(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
/** "24 min" / "2 h 5 min" / "3 d" — how long something has been waiting. */
export function age(date) {
  if (!date) return '';
  const m = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `${Math.floor(m / 1440)} d`;
}

export const MANAGER_ROLES = ['admin', 'manager'];
export const METHOD_LABEL = {
  cash: 'Cash', card: 'Card', evc: 'EVC', invoice: 'On account',
  waafi: 'EVC/ZAAD', edahab: 'eDahab', pbwallet: 'Premier Wallet', sifalo: 'Sifalo Pay',
};

// Order status. 'open' is the internal name of a pay-later order — staff see "In kitchen" / "Unpaid".
export const STATUS = {
  pending: { label: 'Awaiting', tone: 'warn', pulse: true },
  open: { label: 'In kitchen', tone: 'info' },
  confirmed: { label: 'Completed', tone: 'ok' },
  declined: { label: 'Declined', tone: 'plain' },
  voided: { label: 'Voided', tone: 'off', strike: true },
};

/** Money state of an order, as one chip: Paid · Unpaid · On account · Refunded. */
export function payPill(o) {
  if (o.paymentStatus === 'refunded') return { tone: 'off', label: 'Refunded' };
  if (o.paymentStatus === 'paid') return { tone: 'ok', label: 'Paid' };
  if (o.paymentMethod === 'invoice') return { tone: 'info', label: 'On account' };
  return { tone: 'warn', label: 'Unpaid' };
}
/** Unpaid at the counter (pay-later, not billed to an account) — can take payment. */
export const isPayLater = (o) => o.status === 'open';
/** Anything not yet settled in cash: pay-later + On account. */
export const isUnpaid = (o) => o.paymentStatus === 'unpaid' && o.status !== 'voided' && o.status !== 'declined';

export const whoOf = (o) => o.contactName || o.customer?.name || (o.orderType === 'delivery' ? 'Delivery' : (o.tableNumber ? `Table ${o.tableNumber}` : 'Walk-in'));

/** Kept for older imports: the kit icons by the names this file used to export. */
export const Ic = {
  check: <Icon name="check" />,
  x: <Icon name="x" />,
  pen: <Icon name="pen" />,
  print: <Icon name="print" />,
  back: <Icon name="back" />,
  plus: <Icon name="plus" />,
  cash: <Icon name="cash" />,
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
