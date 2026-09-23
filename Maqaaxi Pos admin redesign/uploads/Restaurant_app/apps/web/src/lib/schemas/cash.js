import { z } from 'zod';
import { positiveAmount } from './sales';

const amount = positiveAmount('Enter the amount', 'Enter an amount greater than zero');
const note = z.string().trim().max(300, 'Keep the note under 300 characters');
const zeroOrMore = (v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0);

/** Transfer between two business accounts. */
export const transferSchema = z.object({
  from: z.string().min(1, 'Choose the account the money comes out of'),
  to: z.string().min(1, 'Choose the account it goes into'),
  amount,
  day: z.string().min(1, 'Choose the date'),
  note,
}).superRefine((v, ctx) => {
  if (v.from && v.to && v.from === v.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Choose two different accounts' });
});

/** Owner puts money in / takes money out. */
export const ownerSchema = z.object({
  account: z.string().min(1, 'Choose the account'),
  amount,
  day: z.string().min(1, 'Choose the date'),
  note,
});

/** Day close: the cash must be counted; other accounts are optional but 0 or more. */
export function dayCountSchema(lines) {
  const shape = {};
  for (const l of lines) {
    shape[`c_${l.accountId}`] = l.kind === 'cash'
      ? z.string().trim().min(1, 'Count the cash').refine(zeroOrMore, 'Enter 0 or more')
      : z.string().trim().refine(zeroOrMore, 'Enter 0 or more');
  }
  return z.object(shape);
}

/** Reopen a closed day. */
export const reopenSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason of at least 3 characters').max(300, 'Keep the reason under 300 characters'),
});
