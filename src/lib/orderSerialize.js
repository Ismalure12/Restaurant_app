// One Order → JSON shape for every admin orders endpoint (list, detail,
// edit, void), so the Orders page can swap a PATCH/void response straight
// into its cache without a second, subtly different serializer drifting.

export const ORDER_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true, address: true } },
  staff: { select: { name: true, email: true } },
  waiter: { select: { name: true, email: true } },
  editor: { select: { name: true, email: true } },
  voider: { select: { name: true, email: true } },
  invoice: { select: { id: true, status: true, total: true, amountPaid: true } },
};

const who = (u) => (u ? (u.name || u.email) : null);
const dec = (d) => (d == null ? null : Number(d).toFixed(2));

export function serializeOrder(o) {
  return {
    id: o.id,
    reference: o.reference,
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
    customer: o.customer ?? null,
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
