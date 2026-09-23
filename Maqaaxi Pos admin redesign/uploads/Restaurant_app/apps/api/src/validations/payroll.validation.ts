// Zod schemas — Payroll: paying salaries and salary changes.
import { z } from 'zod';

// ── Payroll ──
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const salaryPaymentLine = z.object({
  staffId: z.number().int().positive(),
  amount: z.number({ error: 'Enter an amount' }).positive('Amount must be greater than zero').max(1000000, 'Amount looks too high'),
  note: z.string().trim().max(200, 'Note is too long').nullable().optional(),
});
// Pay one person or several for a month, in one go.
export const paySalariesSchema = z.object({
  month: z.string().regex(MONTH_RE, 'Month must look like 2026-09'),
  payments: z.array(salaryPaymentLine).min(1, 'Choose who to pay').max(200, 'Too many people at once')
    .refine((a) => new Set(a.map((p) => p.staffId)).size === a.length, 'The same person is listed twice'),
  // Business account the salaries are paid from (Cash, a wallet, the bank).
  paidFromAccountId: z.number({ error: 'Choose which account the salaries are paid from' }).int().positive(),
});

// Set or raise salaries from a month onward — one person, several, or everyone.
export const salaryChangeSchema = z.object({
  staffIds: z.array(z.number().int().positive()).min(1).max(200).optional(),
  all: z.literal(true).optional(),
  mode: z.enum(['set', 'add', 'percent'], { error: 'Choose how to change the salary' }),
  value: z.number({ error: 'Enter an amount' }).min(-1000000).max(1000000, 'Amount looks too high'),
  fromMonth: z.string().regex(MONTH_RE, 'Month must look like 2026-09'),
}).refine((d) => d.all || d.staffIds?.length, { message: 'Choose who gets the change' })
  .refine((d) => d.mode !== 'set' || d.value >= 0, { message: 'Salary cannot be negative' })
  .refine((d) => d.mode !== 'percent' || (d.value >= -100 && d.value <= 1000), { message: 'Percent must be between -100 and 1000' });
