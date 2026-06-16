import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email({ error: 'Invalid email address' }),
  password: z.string().min(1, 'Password is required'),
});

const STAFF_ROLE_VALUES = ['admin', 'manager', 'cashier', 'waiter', 'user'];

export const createUserSchema = z.object({
  email: z.email({ error: 'Invalid email address' }),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(STAFF_ROLE_VALUES, { error: `Role must be one of: ${STAFF_ROLE_VALUES.join(', ')}` }).default('user'),
  name: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

export const updateUserSchema = z.object({
  email: z.email({ error: 'Invalid email address' }).optional(),
  role: z.enum(STAFF_ROLE_VALUES, { error: `Role must be one of: ${STAFF_ROLE_VALUES.join(', ')}` }).optional(),
  name: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.email({ error: 'Invalid email address' }),
});

export const resetPasswordSchema = z.object({
  email: z.email({ error: 'Invalid email address' }),
  code: z.string().length(6, 'Reset code must be exactly 6 characters'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

const PERIODS = ['any', 'morning', 'midday', 'evening'];

export const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100),
  kicker: z.string().max(120).nullable().optional(),
  headline: z.string().max(300).nullable().optional(),
  sub: z.string().max(300).nullable().optional(),
  coverUrl: z.url({ error: 'Cover must be a valid URL' }).nullable().optional(),
  period: z.enum(PERIODS, { error: `Period must be one of: ${PERIODS.join(', ')}` }).optional().default('any'),
  sortOrder: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

const PLATFORMS = ['phone', 'whatsapp', 'instagram', 'facebook', 'twitter', 'tiktok', 'website'];

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

const TAG_VARIANTS = ['default', 'green', 'spicy'];

export const tagSchema = z.object({
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, hyphens'),
  label: z.string().min(1).max(60),
  variant: z.enum(TAG_VARIANTS).optional().default('default'),
});

export const itemTagsSchema = z.object({
  tagIds: z.array(z.number().int().positive()),
});

const SERVICES = ['morning', 'midday', 'evening'];

export const bannerSchema = z.object({
  service: z.enum(SERVICES, { error: `Service must be one of: ${SERVICES.join(', ')}` }),
  tagLabel: z.string().min(1).max(120),
  headline: z.string().min(1).max(400),
  body: z.string().min(1).max(600),
  imageUrl: z.url({ error: 'Image must be a valid URL' }).nullable().optional(),
  ctaText: z.string().min(1).max(60),
  ctaCategorySlug: z.string().max(60).nullable().optional(),
  meta1Label: z.string().max(40).nullable().optional(),
  meta1Value: z.string().max(40).nullable().optional(),
  meta2Label: z.string().max(40).nullable().optional(),
  meta2Value: z.string().max(40).nullable().optional(),
  meta3Label: z.string().max(40).nullable().optional(),
  meta3Value: z.string().max(40).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

// ---- POS / restaurant operations ----

// Mirrors the cart-line Json shape used by the public menu + checkout.
const posCartLineSchema = z.object({
  uid: z.string().optional(),
  itemId: z.number().int().positive().optional(),
  name: z.string().min(1),
  imageUrl: z.string().nullable().optional(),
  optionName: z.string().nullable().optional(),
  extras: z.array(z.object({ name: z.string(), priceAdd: z.number() })).optional().default([]),
  notes: z.string().max(500).optional().default(''),
  unitPrice: z.number().nonnegative(),
  quantity: z.number().int().positive(),
});

export const posOrderSchema = z
  .object({
    items: z.array(posCartLineSchema).min(1, 'Add at least one item'),
    // Exactly two services at the counter — dine-in or delivery (no takeaway).
    orderType: z.enum(['dine_in', 'delivery']).optional().default('dine_in'),
    tableNumber: z.string().max(20).nullable().optional(),
    waiterId: z.number().int().positive().nullable().optional(),
    discountType: z.enum(['percent', 'fixed']).nullable().optional(),
    discountValue: z.number().min(0).nullable().optional(),
    deliveryFee: z.number().min(0).nullable().optional(),
    contactName: z.string().max(120).nullable().optional(),
    contactPhone: z.string().max(40).nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    // Table is always optional now; only delivery has hard requirements.
    if (val.orderType === 'delivery') {
      if (!val.contactPhone) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['contactPhone'], message: 'Contact phone is required for delivery' });
      if (!val.address) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['address'], message: 'Address is required for delivery' });
    }
    if (val.discountType && (val.discountValue == null || val.discountValue <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'Enter a discount amount' });
    }
  });

export const inventoryItemSchema = z.object({
  name: z.string().min(1).max(160),
  unit: z.string().min(1).max(30),
  reorderLevel: z.number().min(0).nullable().optional(),
  costPerUnit: z.number().min(0).nullable().optional(),
  supplier: z.string().max(160).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

const MOVEMENT_TYPES = ['purchase', 'usage', 'adjustment', 'waste'];

export const stockMovementSchema = z.object({
  type: z.enum(MOVEMENT_TYPES, { error: `Type must be one of: ${MOVEMENT_TYPES.join(', ')}` }),
  // signed delta: positive adds stock, negative removes it
  quantity: z.number().refine((n) => n !== 0, 'Quantity cannot be zero'),
  unitCost: z.number().min(0).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});

export const expenseSchema = z.object({
  category: z.string().min(1).max(80),
  amount: z.number().positive(),
  note: z.string().max(300).nullable().optional(),
  incurredAt: z.string().datetime().optional(),
});

export const shiftSchema = z.object({
  openingFloat: z.number().min(0).nullable().optional(),
  closingCash: z.number().min(0).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});
