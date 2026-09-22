// Orders › Online payments: checkouts where the customer was sent to Sifalo
// but no order exists yet — the one place staff can see a payment that "went
// wrong" and help the customer. Shape shared by the list and the actions.
import type { Prisma } from '@prisma/client';
import { classify, reasonText } from './paymentReconciler.js';
import { chargedAmount } from './sifalo.js';

export const ONLINE_PAYMENT_SELECT = {
  id: true, reference: true, name: true, phone: true, address: true, orderType: true, tableNumber: true,
  cartJson: true, amount: true, createdAt: true, initiatedAt: true, lastCheckedAt: true, checkCount: true, lastResult: true,
} satisfies Prisma.PaymentSessionSelect;

type Row = Prisma.PaymentSessionGetPayload<{ select: typeof ONLINE_PAYMENT_SELECT }>;
type Line = { name?: unknown; optionName?: unknown; quantity?: unknown };

const summary = (cart: unknown) =>
  (Array.isArray(cart) ? (cart as Line[]) : [])
    .map((l) => `${Number(l.quantity) || 1}× ${String(l.name ?? 'Item')}${l.optionName ? ` (${String(l.optionName)})` : ''}`)
    .join(', ');

export function serializeOnlinePayment(s: Row, now = new Date()) {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone,
    orderType: s.orderType,
    tableNumber: s.tableNumber,
    address: s.address,
    items: summary(s.cartJson),
    total: Number(s.amount),
    // What Sifalo was asked to charge (differs only while the test charge is on).
    charged: Number(chargedAmount(s.amount)),
    createdAt: s.createdAt,
    startedAt: s.initiatedAt,
    lastCheckedAt: s.lastCheckedAt,
    checks: s.checkCount,
    status: classify(s, now),
    reason: reasonText(s.lastResult),
    // Deliberately no `reference`: the Sifalo order_id is never shown in staff UI.
  };
}
