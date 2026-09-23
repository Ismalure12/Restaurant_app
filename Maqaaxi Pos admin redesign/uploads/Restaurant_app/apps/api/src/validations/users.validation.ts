// Zod schemas — Staff user accounts.
import { z } from 'zod';

const STAFF_ROLE_VALUES = ['admin', 'manager', 'cashier', 'waiter'] as const;

export const createUserSchema = z.object({
  email: z.email({ error: 'Invalid email address' }),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(STAFF_ROLE_VALUES, { error: `Role must be one of: ${STAFF_ROLE_VALUES.join(', ')}` }).default('cashier'),
  name: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  isActive: z.boolean().optional().default(true),
  monthlySalary: z.number().min(0, 'Salary cannot be negative').max(1000000, 'Salary looks too high').nullable().optional(),
});

export const updateUserSchema = z.object({
  email: z.email({ error: 'Invalid email address' }).optional(),
  role: z.enum(STAFF_ROLE_VALUES, { error: `Role must be one of: ${STAFF_ROLE_VALUES.join(', ')}` }).optional(),
  name: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
});
