import { z } from 'zod';

// Front-end (UX-only) rules for the sales forms. They mirror
// apps/api/src/lib/validations.ts; the API re-checks everything.

/** A money/number typed into an input: required, and a number above zero. */
export const positiveAmount = (missing, tooSmall = missing) =>
  z.string({ error: missing }).trim().min(1, missing).refine((v) => v === '' || Number(v) > 0, tooSmall);

/** Optional amount ("" allowed) that, when typed, must be a number of 0 or more. */
const optionalMoney = (msg) => z.string().trim().refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), msg);

// Discount typed as a percent (0-100) or a fixed amount; blank means none.
const discountFields = {
  discountType: z.enum(['percent', 'fixed']),
  discountValue: optionalMoney('Discount can’t be negative'),
};
const discountCheck = (v, ctx) => {
  if (v.discountType === 'percent' && Number(v.discountValue) > 100) {
    ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'A percent discount can’t be more than 100' });
  }
};

/** The Register: everything that must be filled in before the sale can be placed. */
export const registerSchema = z.object({
  cartCount: z.number().min(1, 'Add at least one item'),
  orderType: z.enum(['dine_in', 'delivery']),
  tableRequired: z.boolean(),
  tableChosen: z.boolean(),
  needsWaiter: z.boolean(),
  waiterId: z.string(),
  contactPhone: z.string(),
  address: z.string(),
  deliveryFee: optionalMoney('Delivery fee can’t be negative'),
  flow: z.enum(['pay', 'later']),
  isInvoice: z.boolean(),
  invoiceCustomerId: z.number().nullable(),
  payProblem: z.string().nullable(),
  ...discountFields,
}).superRefine((v, ctx) => {
  const bad = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (v.orderType === 'dine_in') {
    if (v.tableRequired && !v.tableChosen) bad('table', 'Choose the table');
    if (v.needsWaiter && !v.waiterId) bad('waiter', 'Choose the waiter serving this table');
  }
  if (v.flow === 'pay') {
    if (v.orderType === 'delivery') {
      if (!v.contactPhone.trim()) bad('contactPhone', 'Enter the customer’s phone number');
      if (!v.address.trim()) bad('address', 'Enter the delivery address');
    }
    if (v.isInvoice && !v.invoiceCustomerId) bad('invoiceCustomer', 'Select or create the customer to bill');
    if (v.payProblem) bad('payment', v.payProblem);
    discountCheck(v, ctx);
  }
});

/** Orders › Take payment. */
export const takePaymentSchema = z.object({
  isInvoice: z.boolean(),
  invoiceCustomerId: z.number().nullable(),
  payProblem: z.string().nullable(),
  ...discountFields,
}).superRefine((v, ctx) => {
  if (v.isInvoice && !v.invoiceCustomerId) ctx.addIssue({ code: 'custom', path: ['invoiceCustomer'], message: 'Select or create the customer to bill' });
  if (v.payProblem) ctx.addIssue({ code: 'custom', path: ['payment'], message: v.payProblem });
  discountCheck(v, ctx);
});

/** Void a whole order: a reason of at least 3 characters (API: voidOrderSchema). */
export const voidOrderSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason for voiding (at least 3 characters)').max(300, 'Keep the reason under 300 characters'),
});

/** Manager edit of a sale. */
export const editOrderSchema = z.object({
  lineCount: z.number().min(1, 'An order needs at least one item. To cancel the whole order, void it instead.'),
  orderType: z.enum(['dine_in', 'delivery']),
  contactPhone: z.string(),
  address: z.string(),
  discountType: z.enum(['percent', 'fixed']),
  discountValue: optionalMoney('Discount can’t be negative'),
  fee: optionalMoney('Delivery fee can’t be negative'),
  totalProblem: z.string().nullable(),
  reason: z.string().trim().min(3, 'Give a reason for the edit (at least 3 characters)').max(300, 'Keep the reason under 300 characters'),
}).superRefine((v, ctx) => {
  if (v.orderType === 'delivery') {
    if (!v.contactPhone.trim()) ctx.addIssue({ code: 'custom', path: ['contactPhone'], message: 'Enter the customer’s phone number' });
    if (!v.address.trim()) ctx.addIssue({ code: 'custom', path: ['address'], message: 'Enter the delivery address' });
  }
  if (v.totalProblem) ctx.addIssue({ code: 'custom', path: ['total'], message: v.totalProblem });
  discountCheck(v, ctx);
});

/** Add items to an unpaid order: at least one line. */
export const addItemsSchema = z.object({
  lineCount: z.number().min(1, 'Tap an item to add it'),
});

/** Record a payment on an invoice. */
export const invoicePaymentSchema = z.object({
  amount: positiveAmount('Enter the amount received', 'Enter an amount above zero'),
  accountChosen: z.boolean().refine((v) => v, 'Choose which account the money went into'),
  balance: z.number(),
}).superRefine((v, ctx) => {
  if (Number(v.amount) > v.balance + 0.004) {
    ctx.addIssue({ code: 'custom', path: ['amount'], message: `That is more than the balance due ($${v.balance.toFixed(2)})` });
  }
});

/** Dismiss an online payment that will never be an order (API: dismissPaymentSchema). */
export const dismissPaymentSchema = z.object({
  reason: z.string().trim().min(3, 'Say why this payment is being dismissed (at least 3 characters)').max(300, 'Keep the reason under 300 characters'),
});
