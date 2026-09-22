// Closing a sale at the till — shared by the Register's pay-now path
// (POST /api/admin/pos/orders) and by paying an open dine-in tab
// (POST /api/admin/orders/:id/pay), so both close a sale identically.
//
// Invariants:
//  • Money is computed server-side (priceCart / computeOrderTotals) before
//    this runs; nothing here trusts a client amount except cash tendered.
//  • Closing assigns today's next receipt # and stamps closedAt, in the same
//    transaction as the order write.
//  • 'invoice' (On account) bills a customer instead of collecting money:
//    paymentStatus stays 'unpaid' and an Invoice is created alongside.
//  • Money taken writes its cash-book rows (lib/money/cashBook.ts) in the same
//    transaction: one `sale` row per business account it went into.
import type { Prisma } from '@prisma/client';
import { nextReceiptNo } from './receiptNo.js';
import { httpError } from '../../utils/httpError.js';
import { writeSaleEntries, type ResolvedPayment } from '../money/cashBook.js';

export interface InvoiceCustomerInput {
  phone: string;
  name: string;
  address?: string | null;
}

export interface CloseInput {
  /** Already resolved by resolveSalePayment (business accounts + amounts). */
  payment: ResolvedPayment;
  /** Who physically took the money (resolveCollector). */
  collectedById: number | null;
  amountReceived?: number | null;
  invoiceCustomerId?: number | null;
  invoiceCustomer?: InvoiceCustomerInput | null;
  invoiceDueDate?: string | null;
}

export { httpError };

/** Cash tendered can't be less than the bill (it would print a negative change). */
export function checkTendered(input: CloseInput, total: number): string | null {
  if (input.payment.paymentMethod !== 'cash' || input.amountReceived == null) return null;
  return Math.round(input.amountReceived * 100) < Math.round(total * 100)
    ? `Cash received ($${input.amountReceived.toFixed(2)}) is less than the total ($${total.toFixed(2)})`
    : null;
}

/** The customer an On-account sale is billed to — existing by id, or found/created by phone. */
export async function resolveInvoiceCustomer(tx: Prisma.TransactionClient, input: CloseInput) {
  if (input.payment.paymentMethod !== 'invoice') return null;
  if (input.invoiceCustomerId) {
    const row = await tx.customer.findFirst({ where: { id: input.invoiceCustomerId } });
    if (!row) throw httpError('Customer not found', 404);
    return row;
  }
  const c = input.invoiceCustomer;
  if (!c) throw httpError('Select or enter a customer to invoice', 400);
  const existing = await tx.customer.findUnique({ where: { phone: c.phone } });
  return tx.customer.upsert({
    where: { phone: c.phone },
    update: { name: c.name, address: c.address ?? existing?.address ?? '' },
    create: { phone: c.phone, name: c.name, address: c.address ?? '' },
  });
}

/** The order columns that record a closed sale (spread into create/update data). */
export async function closedSaleFields(tx: Prisma.TransactionClient, input: CloseInput, closedAt = new Date()) {
  const isInvoice = input.payment.paymentMethod === 'invoice';
  const { receiptDay, receiptNo } = await nextReceiptNo(tx, closedAt);
  // Card money is the business's own; only cash/wallet money is taken by a person.
  const staffTookMoney = input.payment.parts.some((p) => p.account.kind === 'cash' || p.account.kind === 'wallet');
  return {
    status: 'confirmed',
    // Cash/card/wallet are collected at the counter; an invoice bills the
    // customer instead — no money changes hands now.
    paymentStatus: isInvoice ? 'unpaid' : 'paid',
    paymentMethod: input.payment.paymentMethod,
    paymentAccount: input.payment.paymentAccount,
    collectedById: staffTookMoney ? input.collectedById : null,
    amountReceived: !isInvoice && input.amountReceived != null ? input.amountReceived : null,
    closedAt,
    receiptDay,
    receiptNo,
  };
}

/** The closed sale's money → cash-book rows (same transaction as the order write). */
export function writeClosedSaleEntries(tx: Prisma.TransactionClient, orderId: number, input: CloseInput, createdById: number | null, at: Date) {
  return writeSaleEntries(tx, { orderId, parts: input.payment.parts, collectedById: input.collectedById, createdById, at });
}

export async function createSaleInvoice(
  tx: Prisma.TransactionClient,
  args: {
    orderId: number;
    customerId: number;
    items: Prisma.InputJsonValue;
    subtotal: number;
    discount: number;
    total: number;
    dueDate?: string | null;
    tableNumber: string | null;
    orderType: string;
    userId: number | undefined;
  },
) {
  return tx.invoice.create({
    data: {
      customerId: args.customerId,
      orderId: args.orderId,
      items: args.items,
      subtotal: args.subtotal,
      discount: args.discount,
      total: args.total,
      dueDate: args.dueDate ? new Date(args.dueDate) : null,
      tableNumber: args.tableNumber,
      orderType: args.orderType,
      createdBy: args.userId,
    },
  });
}
