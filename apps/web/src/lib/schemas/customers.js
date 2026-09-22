import { z } from 'zod';

// A customer (Customers page add/edit, customer detail edit). Mirrors
// customerSchema in apps/api/src/lib/validations.ts.
export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Enter the customer’s name').max(120, 'Keep the name under 120 characters'),
  phone: z.string().trim().min(1, 'Enter the customer’s phone number').max(40, 'Keep the phone under 40 characters'),
  address: z.string().trim().max(300, 'Keep the address under 300 characters'),
});
