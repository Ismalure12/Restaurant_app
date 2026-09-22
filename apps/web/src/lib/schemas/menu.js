import { z } from 'zod';
import { intText, maxText, moneyText } from './common';

export const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Enter the category name').max(100, 'Name is too long (max 100 characters)'),
  kicker: maxText(120, 'Kicker'),
  headline: maxText(300, 'Headline'),
  sub: maxText(300, 'Subline'),
});

export const menuItemSchema = z.object({
  name: z.string().trim().min(1, 'Enter the item name').max(200, 'Name is too long (max 200 characters)'),
  description: maxText(2000, 'Description'),
  categoryId: z.string().min(1, 'Choose a category'),
  price: moneyText('Enter a price above 0', { invalid: 'Enter the price as a number, like 4.50', minMsg: 'Enter a price above 0' })
    .refine((v) => Number(v) > 0, 'Enter a price above 0'),
  prepTime: maxText(40, 'Prep time'),
  kcal: maxText(40, 'Kcal'),
  pairing: maxText(80, 'Pairing'),
  sortOrder: z.union([z.literal(''), intText('Enter a whole number', { min: 0, minMsg: 'Sort order cannot be negative' })]),
});

// Option groups, options and extras are saved as you leave each box.
export const groupTitleSchema = z.object({ title: z.string().trim().min(1, 'Give the group a name').max(80, 'Name is too long (max 80)') });
export const optionSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(120, 'Name is too long (max 120)'),
  priceAdd: moneyText('Enter an extra price (0 if free)', { minMsg: 'The extra price cannot be negative' }),
});

export const tagSchema = z.object({
  label: z.string().trim().min(1, 'Enter a label for the tag').max(60, 'Label is too long (max 60 characters)'),
  slug: z.string().trim().max(50, 'Slug is too long (max 50 characters)').regex(/^[a-z0-9-]*$/, 'Use lowercase letters, numbers and hyphens only'),
}).superRefine((v, ctx) => {
  if (!v.slug && v.label && !slugify(v.label)) ctx.addIssue({ code: 'custom', path: ['label'], message: 'Use at least one letter or number in the label' });
});
