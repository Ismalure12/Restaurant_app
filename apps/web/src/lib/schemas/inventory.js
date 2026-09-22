import { z } from 'zod';

/**
 * Inventory, supplier and stock-movement forms (UX only — the API re-validates,
 * see apps/api/src/lib/validations.ts). Form values are the raw strings the
 * inputs hold; every message is written for a person.
 */

const blank = (v) => v == null || String(v).trim() === '';
const isNum = (v) => !blank(v) && Number.isFinite(Number(v));

/** A required number typed in a text/number input. `min` is inclusive, `positive` means > 0. */
export const requiredNumber = (missing, { positive = false, min, max, tooBig = 'That number is too large' } = {}) =>
  z.string().refine(isNum, { message: missing })
    .refine((v) => !isNum(v) || !positive || Number(v) > 0, { message: 'Enter an amount greater than zero' })
    .refine((v) => !isNum(v) || min == null || Number(v) >= min, { message: min === 0 ? 'This can’t be negative' : `Must be at least ${min}` })
    .refine((v) => !isNum(v) || max == null || Number(v) <= max, { message: tooBig });

/** An optional number: empty is fine, anything typed must be a valid number ≥ min. */
export const optionalNumber = ({ min = 0 } = {}) =>
  z.string().refine((v) => blank(v) || Number.isFinite(Number(v)), { message: 'Enter a number' })
    .refine((v) => blank(v) || !Number.isFinite(Number(v)) || Number(v) >= min, { message: 'This can’t be negative' });

/** Number or null from a form string. */
export const numOrNull = (v) => (blank(v) ? null : Number(v));

export const inventoryItemFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter the item name').max(160, 'The name is too long (160 characters at most)'),
  unit: z.string().trim().min(1, 'Enter the unit, for example kg, L or pcs').max(30, 'The unit is too long'),
  reorderLevel: optionalNumber(),
  costPerUnit: optionalNumber(),
  supplier: z.string().trim().max(160, 'The supplier name is too long'),
});

/**
 * The stock-movement sheet. `paidFrom` is the account id already resolved
 * (chosen, or the default cash account) so the message points at what's missing.
 */
export const stockMovementFormSchema = z.object({
  type: z.enum(['purchase', 'usage', 'waste', 'adjustment']),
  quantity: z.string().refine(isNum, { message: 'Enter how much stock moved' }).refine((v) => !isNum(v) || Number(v) !== 0, { message: 'The quantity can’t be zero' }),
  totalCost: optionalNumber(),
  supplierId: z.string(),
  onCredit: z.boolean(),
  paidFrom: z.string(),
  note: z.string().max(300, 'The note is too long (300 characters at most)'),
}).superRefine((d, ctx) => {
  if (d.type === 'adjustment' ? false : isNum(d.quantity) && Number(d.quantity) < 0) {
    ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Enter the amount without a minus sign' });
  }
  if (d.type !== 'purchase') return;
  const cost = Number(d.totalCost);
  const costed = isNum(d.totalCost) && cost > 0;
  if (d.onCredit) {
    if (!d.supplierId) ctx.addIssue({ code: 'custom', path: ['supplierId'], message: 'Choose the supplier this purchase is owed to' });
    if (!costed) ctx.addIssue({ code: 'custom', path: ['totalCost'], message: 'Enter what the purchase cost' });
  } else if (costed && !d.paidFrom) {
    ctx.addIssue({ code: 'custom', path: ['paidFrom'], message: 'Choose which account the money came out of' });
  }
});

export const supplierFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter the supplier’s name').max(80, 'The name is too long (80 characters at most)'),
  phone: z.string().trim().max(40, 'The phone number is too long'),
});

/** Pay a supplier: never more than is owed. */
export const supplierPaymentSchema = (owed) => z.object({
  amount: requiredNumber('Enter the amount you are paying', { positive: true }).refine((v) => !isNum(v) || Number(v) <= owed + 0.005, { message: `You can’t pay more than is owed ($${Number(owed).toFixed(2)})` }),
  accountId: z.string().min(1, 'Choose which account the money came out of'),
  note: z.string().max(300, 'The note is too long (300 characters at most)'),
});
