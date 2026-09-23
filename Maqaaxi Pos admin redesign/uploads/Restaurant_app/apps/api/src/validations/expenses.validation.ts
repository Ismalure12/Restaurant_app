// Zod schemas — Expenses.
import { z } from 'zod';

// incurredAt accepts the form's date-only "YYYY-MM-DD" or a full ISO datetime.
const expenseDate = z.string().refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isNaN(Date.parse(s)), 'Enter a valid date');

export const expenseSchema = z.object({
  category: z.string({ error: 'Category is required' }).trim().min(1, 'Category is required').max(80, 'Category is too long'),
  amount: z.number({ error: 'Enter an amount' }).positive('Amount must be greater than zero').max(10000000, 'Amount is too large'),
  note: z.string().trim().max(300, 'Note is too long').nullable().optional(),
  incurredAt: expenseDate.optional(),
  // Business account the money came out of (Cash, a wallet, the card, the bank).
  paidFromAccountId: z.number({ error: 'Choose which account the money came out of' }).int().positive(),
});
