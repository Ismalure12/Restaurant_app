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

// The headline is rendered with dangerouslySetInnerHTML on the public menu —
// strip every tag except the design's <em>/</em> so stored XSS is impossible.
const sanitizeHeadline = (v) => (v == null ? v : v.replace(/<(?!\/?em>)[^>]*>/gi, ''));

export const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100),
  kicker: z.string().max(120).nullable().optional(),
  headline: z.string().max(300).nullable().optional().transform(sanitizeHeadline),
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
  itemId: z.number().int().positive(),
  name: z.string().min(1),
  imageUrl: z.string().nullable().optional(),
  optionName: z.string().nullable().optional(),
  extras: z.array(z.object({ name: z.string(), priceAdd: z.number() })).optional().default([]),
  notes: z.string().max(500).optional().default(''),
  // Display-only — the server reprices every line from the database.
  unitPrice: z.number().nonnegative(),
  quantity: z.number().int().positive().max(99),
});

// A customer identified/created inline from the POS invoice step (mirrors
// the checkout flow's contact fields).
export const invoiceCustomerSchema = z.object({
  phone: z.string().min(1, 'Phone is required').max(40),
  name: z.string().min(1, 'Name is required').max(120),
  address: z.string().max(300).nullable().optional(),
});

// The dedicated Customer CRUD surface (Customers page + picker "+ New
// customer" form). Same shape as invoiceCustomerSchema but named for its
// own use so the two can evolve independently.
export const customerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  phone: z.string().min(1, 'Phone is required').max(40),
  address: z.string().max(300).nullable().optional(),
});

export const updateCustomerSchema = customerSchema.partial();

const PAYMENT_METHODS = ['cash', 'card', 'evc', 'invoice'];

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
    // How the customer paid. 'invoice' bills the customer instead of
    // collecting payment now — see invoiceCustomerId/invoiceCustomer below.
    paymentMethod: z.enum(PAYMENT_METHODS, { error: `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}` }),
    // Cash tendered — enables a change-due line on the receipt. Cash only.
    amountReceived: z.number().min(0).nullable().optional(),
    // Invoice customer — an existing one by id, or enough to create one.
    invoiceCustomerId: z.number().int().positive().nullable().optional(),
    invoiceCustomer: invoiceCustomerSchema.nullable().optional(),
    invoiceDueDate: z.string().datetime().nullable().optional(),
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
    if (val.paymentMethod === 'invoice' && !val.invoiceCustomerId && !val.invoiceCustomer) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['invoiceCustomer'], message: 'Select or enter a customer to invoice' });
    }
  });

// ── Manager-only order correction ────────────────────────────────────────
//
// Editing an existing order is a FULL REPLACE of its priced content, not a
// sparse patch, because `discountType` is never persisted — only the resolved
// flat `discount` is — so a percentage discount can't be re-derived from the
// stored row. The client re-states the whole order every time.
//
// Deliberately NOT editable: paymentMethod (would need create/void-an-invoice
// logic), paymentStatus/status (owned by accept/decline/void), amountReceived
// (the tender physically taken is a historical fact), waiterId/staffId (the
// attribution keys every performance report groups by), customerId, source,
// reference, createdAt.
export const updateOrderSchema = z
  .object({
    items: z.array(posCartLineSchema).min(1, 'An order must keep at least one item — void it instead'),
    orderType: z.enum(['dine_in', 'delivery']),
    tableNumber: z.string().max(20).nullable().optional(),
    discountType: z.enum(['percent', 'fixed']).nullable().optional(),
    discountValue: z.number().min(0).nullable().optional(),
    deliveryFee: z.number().min(0).nullable().optional(),
    contactName: z.string().max(120).nullable().optional(),
    contactPhone: z.string().max(40).nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    // Required: an edit to money already counted in revenue with no stated
    // reason is indistinguishable from tampering.
    editReason: z.string({ error: 'Give a reason for the edit' }).trim().min(3, 'Give a reason for the edit').max(300),
  })
  .superRefine((val, ctx) => {
    // Mirrors posOrderSchema so a correction can't produce a shape the create
    // route would have rejected.
    if (val.orderType === 'delivery') {
      if (!val.contactPhone) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['contactPhone'], message: 'Contact phone is required for delivery' });
      if (!val.address) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['address'], message: 'Address is required for delivery' });
    }
    if (val.discountType && (val.discountValue == null || val.discountValue <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'Enter a discount amount' });
    }
  });

// Void takes only a reason. Void vs refund is DERIVED server-side from the
// order's paymentStatus — a client flag would be a second, spoofable source of
// truth for a money decision.
export const voidOrderSchema = z.object({
  reason: z.string({ error: 'Give a reason for voiding' }).trim().min(3, 'Give a reason for voiding').max(300),
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
  // Total price paid for the whole purchased quantity (purchase-type only) —
  // NOT a per-unit price, since unit price fluctuates day to day.
  totalCost: z.number().min(0).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});

// incurredAt accepts the form's date-only "YYYY-MM-DD" or a full ISO datetime.
const expenseDate = z.string().refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isNaN(Date.parse(s)), 'Enter a valid date');

export const expenseSchema = z.object({
  category: z.string({ error: 'Category is required' }).trim().min(1, 'Category is required').max(80, 'Category is too long'),
  amount: z.number({ error: 'Enter an amount' }).positive('Amount must be greater than zero').max(10000000, 'Amount is too large'),
  note: z.string().trim().max(300, 'Note is too long').nullable().optional(),
  incurredAt: expenseDate.optional(),
});

export const shiftSchema = z.object({
  openingFloat: z.number().min(0).nullable().optional(),
  closingCash: z.number().min(0).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});

// ── Invoicing (customers who pay later) ──────────────────────────────────

const invoiceLineSchema = z.object({
  description: z.string().min(1).max(200),
  quantity: z.number().positive().max(9999),
  unitPrice: z.number().nonnegative(),
});

export const createInvoiceSchema = z
  .object({
    customerId: z.number().int().positive().optional(),
    customer: invoiceCustomerSchema.optional(),
    items: z.array(invoiceLineSchema).min(1, 'Add at least one line'),
    discount: z.number().min(0).optional().default(0),
    dueDate: z.string().datetime().nullable().optional(),
    tableNumber: z.string().max(20).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.customerId && !val.customer) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customer'], message: 'Select or enter a customer' });
    }
  });

export const updateInvoiceSchema = z.object({
  dueDate: z.string().datetime().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  // Only 'void' is settable here — 'paid'/'partial'/'unpaid' are derived from
  // recorded payments, never set directly.
  status: z.enum(['unpaid', 'void']).optional(),
});

const INVOICE_PAYMENT_METHODS = ['cash', 'card', 'evc'];

export const recordInvoicePaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(INVOICE_PAYMENT_METHODS, { error: `Method must be one of: ${INVOICE_PAYMENT_METHODS.join(', ')}` }),
  note: z.string().max(300).nullable().optional(),
  paidAt: z.string().datetime().optional(),
});
