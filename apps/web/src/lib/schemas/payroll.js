import { z } from 'zod';
import { requiredNumber } from './inventory';

/** Change salary (mirrors salaryChangeSchema). `thisMonth` is 'YYYY-MM'; a change can't start in the past. */
export const salaryFormSchema = (mode, thisMonth) => z.object({
  value: requiredNumber(mode === 'percent' ? 'Enter the percent' : 'Enter an amount', {
    min: mode === 'set' ? 0 : undefined, max: mode === 'percent' ? 1000 : 1000000, tooBig: 'That looks too high',
  }).refine((v) => mode !== 'percent' || !Number.isFinite(Number(v)) || Number(v) >= -100, { message: 'A cut can’t be more than 100%' }),
  fromMonth: z.string().min(1, 'Choose the month it starts').refine((v) => !v || v >= thisMonth, { message: 'A change starts this month or later' }),
});

/** One person's amount in the pay dialog. */
export const payAmountSchema = requiredNumber('Enter the amount', { positive: true, max: 1000000, tooBig: 'That looks too high' });

/** Pay salaries: the account and the note (each line's amount uses payAmountSchema). */
export const payFormSchema = z.object({
  paidFromAccountId: z.string().min(1, 'Choose which account the salaries are paid from'),
  note: z.string().max(200, 'The note is too long (200 characters at most)'),
});
