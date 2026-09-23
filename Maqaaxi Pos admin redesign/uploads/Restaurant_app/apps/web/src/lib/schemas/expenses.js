import { z } from 'zod';
import { requiredNumber } from './inventory';

/** Add / edit an expense (mirrors expenseSchema in apps/api/src/lib/validations.ts). */
export const expenseFormSchema = z.object({
  category: z.string().trim().min(1, 'Enter or choose a category').max(80, 'The category is too long (80 characters at most)'),
  amount: requiredNumber('Enter the amount', { positive: true, max: 10000000, tooBig: 'That amount is too large' }),
  incurredAt: z.string().min(1, 'Choose the date'),
  paidFromAccountId: z.string().min(1, 'Choose which account the money came out of'),
  note: z.string().max(300, 'The note is too long (300 characters at most)'),
});
