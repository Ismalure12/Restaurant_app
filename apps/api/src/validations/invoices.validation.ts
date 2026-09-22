// Zod schemas — Invoices (On account) and their payments.
import { z } from 'zod';
import { invoiceCustomerSchema } from './customers.validation.js';

// ── Invoicing (customers who pay later) ──────────────────────────────────

const invoiceLineSchema = z.object({
  description: z.string().min(1).max(200),
  quantity: z.number().positive().max(9999),
  unitPrice: z.number().nonnegative(),
});

export const createInvoiceSchema = z
  .object({
    customerId: z.number().int().positive().optional(),
    customer: invoiceCustomerSchema.optional(),
    items: z.array(invoiceLineSchema).min(1, 'Add at least one line'),
    discount: z.number().min(0).optional().default(0),
    dueDate: z.string().datetime().nullable().optional(),
    tableNumber: z.string().max(20).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.customerId && !val.customer) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customer'], message: 'Select or enter a customer' });
    }
  });

export const updateInvoiceSchema = z.object({
  dueDate: z.string().datetime().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  // Only 'void' is settable here — 'paid'/'partial'/'unpaid' are derived from
  // recorded payments, never set directly.
  status: z.enum(['unpaid', 'void']).optional(),
});

export const recordInvoicePaymentSchema = z.object({
  amount: z.number().positive(),
  // The business account the money went into (Cash, a wallet, the card).
  accountId: z.number({ error: 'Choose which account the money went into' }).int().positive(),
  // Who took the money — the signed-in person unless named (a waiter at the table).
  collectedById: z.number().int().positive().nullable().optional(),
  note: z.string().max(300).nullable().optional(),
  paidAt: z.string().datetime().optional(),
});
