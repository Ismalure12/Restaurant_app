// Zod schemas — Register sales, pay-later orders, manager order edits and voids.
import { z } from 'zod';
import { invoiceCustomerSchema } from './customers.validation.js';

// ---- POS / restaurant operations ----

// Mirrors the cart-line Json shape used by the public menu + checkout.
const posCartLineSchema = z.object({
  uid: z.string().optional(),
  itemId: z.number().int().positive(),
  name: z.string().min(1),
  imageUrl: z.string().nullable().optional(),
  optionName: z.string().nullable().optional(),
  extras: z.array(z.object({ name: z.string(), priceAdd: z.number() })).optional().default([]),
  notes: z.string().max(500).optional().default(''),
  // Display-only — the server reprices every line from the database.
  unitPrice: z.number().nonnegative(),
  quantity: z.number().int().positive().max(99),
});

// cash · card (the business Mastercard) · evc (a mobile wallet: A/C, E/d, My
// Cash…, named by accountId) · split (payments[]) · invoice (On account).
const PAYMENT_METHODS = ['cash', 'card', 'evc', 'split', 'invoice'] as const;

const paymentMethodField = z.enum(PAYMENT_METHODS, { error: `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}` });

// How a sale is settled at the till — shared by pay-now and paying a pay-later order.
const settlementFields = {
  // 'invoice' bills the customer (On account) instead of collecting payment
  // now — see invoiceCustomerId/invoiceCustomer below.
  paymentMethod: paymentMethodField,
  // Business wallet the money went into ('evc'). Checked server-side.
  accountId: z.number().int().positive().nullable().optional(),
  // 'split': the parts, each into a different business account.
  payments: z.array(z.object({
    accountId: z.number().int().positive(),
    amount: z.number().positive().max(1_000_000),
  })).min(2, 'A split payment has at least 2 parts').max(4, 'A split payment has at most 4 parts').nullable().optional(),
  // The waiter/cashier who physically took the money (defaults server-side).
  collectedById: z.number().int().positive().nullable().optional(),
  // Cash tendered — enables a change-due line on the receipt. Cash only.
  amountReceived: z.number().min(0).nullable().optional(),
  // Invoice customer — an existing one by id, or enough to create one.
  invoiceCustomerId: z.number().int().positive().nullable().optional(),
  invoiceCustomer: invoiceCustomerSchema.nullable().optional(),
  invoiceDueDate: z.string().datetime().nullable().optional(),
};

type Settlement = { paymentMethod?: string; invoiceCustomerId?: number | null; invoiceCustomer?: unknown };
function checkSettlement(val: Settlement, ctx: z.RefinementCtx) {
  if (val.paymentMethod === 'invoice' && !val.invoiceCustomerId && !val.invoiceCustomer) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['invoiceCustomer'], message: 'Select or enter a customer to invoice' });
  }
}

export const posOrderSchema = z
  .object({
    items: z.array(posCartLineSchema).min(1, 'Add at least one item'),
    // Exactly two services at the counter — dine-in or delivery (no takeaway).
    orderType: z.enum(['dine_in', 'delivery']).optional().default('dine_in'),
    tableNumber: z.string().max(20).nullable().optional(),
    waiterId: z.number().int().positive().nullable().optional(),
    discountType: z.enum(['percent', 'fixed']).nullable().optional(),
    discountValue: z.number().min(0).nullable().optional(),
    deliveryFee: z.number().min(0).nullable().optional(),
    contactName: z.string().max(120).nullable().optional(),
    contactPhone: z.string().max(40).nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    // false = open a dine-in TAB: sent to the kitchen now, paid at the end
    // (POST /api/admin/orders/:id/pay). true = the classic pay-first sale.
    payNow: z.boolean().optional().default(true),
    ...settlementFields,
    paymentMethod: paymentMethodField.optional(),
  })
  .superRefine((val, ctx) => {
    // Table is always optional now; only delivery has hard requirements.
    if (val.orderType === 'delivery') {
      if (!val.contactPhone) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['contactPhone'], message: 'Contact phone is required for delivery' });
      if (!val.address) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['address'], message: 'Address is required for delivery' });
    }
    if (val.discountType && (val.discountValue == null || val.discountValue <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'Enter a discount amount' });
    }
    if (val.payNow) {
      if (!val.paymentMethod) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paymentMethod'], message: 'Choose how the customer paid' });
      checkSettlement(val, ctx);
    } else {
      // Pay later is dine-in only and settles (discount included) at the end.
      if (val.orderType !== 'dine_in') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['payNow'], message: 'Only dine-in orders can be paid later — take payment for delivery now' });
      if (val.discountType) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountType'], message: 'Apply the discount when taking payment' });
    }
  });

// Adding items (drinks, dessert…) to an unpaid pay-later order. Server-priced; appended.
export const addTabItemsSchema = z.object({
  items: z.array(posCartLineSchema).min(1, 'Add at least one item'),
});

// Taking payment for a pay-later order at the end of the meal.
export const payTabSchema = z
  .object({
    ...settlementFields,
    discountType: z.enum(['percent', 'fixed']).nullable().optional(),
    discountValue: z.number().min(0).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.discountType && (val.discountValue == null || val.discountValue <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'Enter a discount amount' });
    }
    checkSettlement(val, ctx);
  });

// ── Manager-only order correction ────────────────────────────────────────
//
// Editing an existing order is a FULL REPLACE of its priced content, not a
// sparse patch, because `discountType` is never persisted — only the resolved
// flat `discount` is — so a percentage discount can't be re-derived from the
// stored row. The client re-states the whole order every time.
//
// Deliberately NOT editable: paymentMethod (would need create/void-an-invoice
// logic), paymentStatus/status (owned by accept/decline/void), amountReceived
// (the tender physically taken is a historical fact), waiterId/staffId (the
// attribution keys every performance report groups by), customerId, source,
// reference, createdAt.
export const updateOrderSchema = z
  .object({
    items: z.array(posCartLineSchema).min(1, 'An order must keep at least one item — void it instead'),
    orderType: z.enum(['dine_in', 'delivery']),
    tableNumber: z.string().max(20).nullable().optional(),
    discountType: z.enum(['percent', 'fixed']).nullable().optional(),
    discountValue: z.number().min(0).nullable().optional(),
    deliveryFee: z.number().min(0).nullable().optional(),
    contactName: z.string().max(120).nullable().optional(),
    contactPhone: z.string().max(40).nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    // Required: an edit to money already counted in revenue with no stated
    // reason is indistinguishable from tampering.
    editReason: z.string({ error: 'Give a reason for the edit' }).trim().min(3, 'Give a reason for the edit').max(300),
  })
  .superRefine((val, ctx) => {
    // Mirrors posOrderSchema so a correction can't produce a shape the create
    // route would have rejected.
    if (val.orderType === 'delivery') {
      if (!val.contactPhone) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['contactPhone'], message: 'Contact phone is required for delivery' });
      if (!val.address) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['address'], message: 'Address is required for delivery' });
    }
    if (val.discountType && (val.discountValue == null || val.discountValue <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'Enter a discount amount' });
    }
  });

// Void takes only a reason. Void vs refund is DERIVED server-side from the
// order's paymentStatus — a client flag would be a second, spoofable source of
// truth for a money decision.
export const voidOrderSchema = z.object({
  reason: z.string({ error: 'Give a reason for voiding' }).trim().min(3, 'Give a reason for voiding').max(300),
});
