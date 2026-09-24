import { z } from 'zod';
import { maxText, moneyText } from './common';

export const businessSchema = z.object({
  businessName: z.string().trim().min(1, 'Enter the business name — it heads every receipt').max(120, 'Business name is too long (max 120 characters)'),
  businessPhone: maxText(60, 'Phone'),
  businessAddress: maxText(300, 'Address'),
  taxId: maxText(60, 'Tax ID'),
  orderPrefix: z.string().trim().regex(/^[A-Za-z0-9]{1,8}$/, 'Use 1–8 letters or digits, no spaces'),
  receiptFooter: maxText(300, 'Receipt message'),
  invoiceTerms: maxText(600, 'Payment terms'),
});

export const feeSchema = z.object({ fee: moneyText('Enter a delivery fee of 0 or more', { minMsg: 'The fee cannot be negative' }) });

export const taxSchema = z.object({
  tax: moneyText('Enter the tax rate (0 if none)', { max: 50, minMsg: 'Tax cannot be negative', maxMsg: 'Tax rate looks too high (max 50%)' }),
});

export const calendarSchema = z.object({
  dayEnd: z.string().regex(/^[0-6]$/, 'Choose an hour from 00:00 to 06:00'),
  fy: z.string().regex(/^([1-9]|1[0-2])$/, 'Choose a month'),
});

export const accountSchema = z.object({
  label: z.string().trim().min(1, 'Enter a name for the account').max(30, 'Account name is too long (max 30 characters)'),
  number: z.string().trim().max(40, 'Number is too long (max 40 characters)'),
});

/** Opening balances: the date plus one `bal_<accountId>` amount per account. */
export const openingSchema = (todayKey) => z.object({
  openDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the opening date').refine((d) => d <= todayKey, 'The opening date cannot be in the future'),
}).catchall(moneyText('Enter this account’s balance (0 if empty)', { minMsg: 'A balance cannot be negative' }));

export const socialLinkSchema = z.object({
  platform: z.string().min(1, 'Choose a platform'),
  value: z.string().trim().min(1, 'Enter the handle or link'),
});

export const onlineOrderingSchema = z.object({ message: maxText(300, 'Message') });
