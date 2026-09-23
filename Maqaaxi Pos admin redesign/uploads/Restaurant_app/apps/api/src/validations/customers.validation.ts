// Zod schemas — Customers (account / owing customers).
import { z } from 'zod';

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
