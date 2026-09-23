import { z } from 'zod';
import { intText } from './common';

export const MAX_BATCH = 50;
const tableName = z.string().trim().min(1, 'Enter a table name, like 5 or Terrace 2').max(20, 'Table name is too long (max 20 characters)');

export const oneTableSchema = z.object({ name: tableName });

export const tableRangeSchema = z.object({
  from: intText('Enter the first table number', { min: 0, minMsg: 'The first number cannot be negative' }),
  to: intText('Enter the last table number', { min: 0, minMsg: 'The last number cannot be negative' }),
}).superRefine((v, ctx) => {
  const a = Number(v.from); const b = Number(v.to);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return;
  if (b < a) ctx.addIssue({ code: 'custom', path: ['to'], message: 'The last number must be the same as or after the first' });
  else if (b - a + 1 > MAX_BATCH) ctx.addIssue({ code: 'custom', path: ['to'], message: `Add at most ${MAX_BATCH} tables at a time` });
});

export const editTableSchema = z.object({
  name: tableName,
  sortOrder: intText('Enter a position (0 or more)', { min: 0, max: 9999, minMsg: 'Position cannot be negative', maxMsg: 'Position is too high (max 9999)' }),
});
