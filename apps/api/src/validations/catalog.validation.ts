// Zod schemas — Menu management: categories, social links, items, option groups/options, extras, tags.
import { z } from 'zod';

// The headline is rendered with dangerouslySetInnerHTML on the public menu —
// strip every tag except the design's <em>/</em> so stored XSS is impossible.
const sanitizeHeadline = (v: string | null | undefined) => (v == null ? v : v.replace(/<(?!\/?em>)[^>]*>/gi, ''));

export const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100),
  kicker: z.string().max(120).nullable().optional(),
  headline: z.string().max(300).nullable().optional().transform(sanitizeHeadline),
  sub: z.string().max(300).nullable().optional(),
  coverUrl: z.url({ error: 'Cover must be a valid URL' }).nullable().optional(),
  sortOrder: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

const PLATFORMS = ['phone', 'whatsapp', 'instagram', 'facebook', 'twitter', 'tiktok', 'website'] as const;

export const socialLinkSchema = z.object({
  platform: z.enum(PLATFORMS, { error: `Platform must be one of: ${PLATFORMS.join(', ')}` }),
  value: z.string().min(1, 'Value is required'),
});

export const updateSocialLinkSchema = z.object({
  value: z.string().min(1, 'Value is required'),
});

export const menuItemSchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  price: z.number().positive(),
  imageUrl: z.url({ error: 'Image must be a valid URL' }).nullable().optional(),
  kcal: z.string().max(40).nullable().optional(),
  prepTime: z.string().max(40).nullable().optional(),
  pairing: z.string().max(80).nullable().optional(),
  sortOrder: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export const optionGroupSchema = z.object({
  menuItemId: z.number().int().positive(),
  title: z.string().min(1).max(80),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export const itemOptionSchema = z.object({
  optionGroupId: z.number().int().positive(),
  name: z.string().min(1).max(120),
  priceAdd: z.number().min(0).optional().default(0),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export const itemExtraSchema = z.object({
  menuItemId: z.number().int().positive(),
  name: z.string().min(1).max(120),
  priceAdd: z.number().min(0).optional().default(0),
  sortOrder: z.number().int().min(0).optional().default(0),
});

const TAG_VARIANTS = ['default', 'green', 'spicy'] as const;

export const tagSchema = z.object({
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, hyphens'),
  label: z.string().min(1).max(60),
  variant: z.enum(TAG_VARIANTS).optional().default('default'),
});

export const itemTagsSchema = z.object({
  tagIds: z.array(z.number().int().positive()),
});
