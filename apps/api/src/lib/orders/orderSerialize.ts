// One Order → JSON shape for every admin orders endpoint (list, detail,
// edit, void), so the Orders page can swap a PATCH/void response straight
// into its cache without a second, subtly different serializer drifting.
import { formatOrderCode, DEFAULT_ORDER_PREFIX } from './orderCode.js';
import { formatReceiptNo } from './receiptNo.js';

// A staff member's own wallet numbers (their A/C, E/d, My Cash…) — printed on
// the bill so the customer knows where to send the money.
const NUMBERS = { select: { number: true, accountId: true, account: { select: { label: true, isActive: true, sortOrder: true } } } } as const;
const PERSON = { select: { id: true, name: true, email: true, isActive: true, staffAccounts: NUMBERS } } as const;

export const PAY_TO_PEOPLE = { staff: PERSON, waiter: PERSON, collectedBy: PERSON } as const;

export const ORDER_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true, address: true } },
  // Online orders: the Sifalo payer — shown in the same `customer` slot.
  client: { select: { id: true, name: true, phone: true, address: true } },
  staff: PERSON,
  waiter: PERSON,
  collectedBy: PERSON,
  // How the money was split across business accounts (cash-book sale rows).
  entries: { where: { kind: 'sale' }, select: { amount: true, account: { select: { label: true, kind: true } } }, orderBy: { id: 'asc' } },
  editor: { select: { name: true, email: true } },
  voider: { select: { name: true, email: true } },
  invoice: { select: { id: true, status: true, total: true, amountPaid: true } },
} as const;

type Person = { name: string | null; email: string } | null | undefined;

const who = (u: Person) => (u ? (u.name || u.email) : null);

type Numbered = { name: string | null; email: string; isActive?: boolean; staffAccounts?: { number: string; accountId: number; account: { label: string; isActive: boolean; sortOrder: number } }[] } | null | undefined;
// Someone who has left never gets money sent to their personal wallet: no numbers (the print falls back to the business ones).
const numbersOf = (u: Numbered) => (u && u.isActive === false ? [] : (u?.staffAccounts ?? []))
  .filter((s) => s.account.isActive)
  .sort((a, b) => a.account.sortOrder - b.account.sortOrder)
  .map((s) => ({ accountId: s.accountId, label: s.account.label, number: s.number }));

/**
 * Whose wallet numbers a printed bill/receipt shows: whoever took the money;
 * before payment, the table's waiter (dine-in) or whoever rang it up. The
 * print lists every business wallet and uses this person's number for the
 * wallets they have (the business number for the rest), so `numbers` may be
 * empty — the name still prints.
 */
export function payToOf(o: any) {
  const person: Numbered = o.collectedBy ?? (o.orderType === 'dine_in' ? o.waiter : null) ?? o.staff;
  if (!person) return null;
  return { name: person.isActive === false ? null : person.name?.trim() || null, numbers: numbersOf(person) };
}
const dec = (d: unknown) => (d == null ? null : Number(d).toFixed(2));

// `prefix` is Settings → order_prefix (getOrderPrefix), read once per request.
export function serializeOrder(o: any, prefix = DEFAULT_ORDER_PREFIX) {
  return {
    id: o.id,
    // Short staff-facing ID (KFG-260919-0101). `reference` stays the random
    // public token — never show it on paper or search by it in the UI.
    code: formatOrderCode(o, prefix),
    reference: o.reference,
    receiptNo: formatReceiptNo(o.receiptNo),
    receiptDay: o.receiptDay ?? null,
    closedAt: o.closedAt ?? null,
    paymentAccount: o.paymentAccount ?? null,
    status: o.status,
    total: dec(o.total),
    address: o.address,
    orderType: o.orderType,
    tableNumber: o.tableNumber,
    source: o.source,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    amountReceived: dec(o.amountReceived),
    discount: dec(o.discount) ?? '0.00',
    deliveryFee: dec(o.deliveryFee) ?? '0.00',
    contactName: o.contactName,
    contactPhone: o.contactPhone,
    staff: who(o.staff),
    waiter: who(o.waiter),
    // Name only (never the login email) — what printed receipts use.
    staffName: o.staff?.name?.trim() || null,
    waiterName: o.waiter?.name?.trim() || null,
    staffId: o.staffId ?? null,
    waiterId: o.waiterId ?? null,
    collectedById: o.collectedById ?? null,
    collectedBy: who(o.collectedBy),
    // Money parts by business account (one for a plain sale, 2–4 for a split).
    payments: (o.entries ?? []).map((e: { amount: unknown; account: { label: string; kind: string } }) => ({ label: e.account.label, kind: e.account.kind, amount: dec(e.amount) })),
    payTo: payToOf(o),
    items: o.items,
    paymentTransactionId: o.paymentTransactionId,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt ?? null,
    editedBy: who(o.editor),
    editedAt: o.editedAt ?? null,
    editReason: o.editReason ?? null,
    voidedBy: who(o.voider),
    voidedAt: o.voidedAt ?? null,
    voidReason: o.voidReason ?? null,
    customer: o.customer ?? o.client ?? null,
    invoice: o.invoice
      ? {
          id: o.invoice.id,
          status: o.invoice.status,
          total: dec(o.invoice.total),
          amountPaid: dec(o.invoice.amountPaid),
          balance: Math.max(0, Number(o.invoice.total) - Number(o.invoice.amountPaid)).toFixed(2),
        }
      : null,
  };
}
